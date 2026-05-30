import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("projects tRPC API", () => {
  it("creates a user-scoped project tied to an owned client and emits a project.created event", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild", status: "active" });

    assert.equal(project.userId, "user_1");
    assert.equal(project.clientId, client.id);
    assert.equal(project.status, "active");
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created"],
    );
  });

  it("lists active projects by client, status, and search without leaking another user's records", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const client = await userOne.clients.create({ name: "Ada Lovelace" });
    const otherClient = await userOne.clients.create({ name: "Charles Babbage" });
    const foreignClient = await userTwo.clients.create({ name: "Grace Hopper" });
    await userOne.projects.create({ clientId: client.id, name: "Website rebuild", description: "Analytical Engine portal", status: "active" });
    await userOne.projects.create({ clientId: otherClient.id, name: "Different project", status: "active" });
    await userTwo.projects.create({ clientId: foreignClient.id, name: "Foreign portal", description: "Analytical Engine portal", status: "active" });

    const result = await userOne.projects.list({ clientId: client.id, search: "Analytical", status: "active" });

    assert.deepEqual(
      result.map((project) => project.name),
      ["Website rebuild"],
    );
  });

  it("rejects project parent client IDs that are missing, deleted, or owned by another user", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const deletedClient = await userOne.clients.create({ name: "Deleted client" });
    const foreignClient = await userTwo.clients.create({ name: "Foreign client" });
    const activeClient = await userOne.clients.create({ name: "Active client" });
    const project = await userOne.projects.create({ clientId: activeClient.id, name: "Owned project" });
    await userOne.clients.delete({ id: deletedClient.id });

    await assert.rejects(userOne.projects.create({ clientId: "missing_client", name: "Missing parent" }), /Client not found/u);
    await assert.rejects(userOne.projects.create({ clientId: deletedClient.id, name: "Deleted parent" }), /Client not found/u);
    await assert.rejects(userOne.projects.create({ clientId: foreignClient.id, name: "Foreign parent" }), /Client not found/u);
    await assert.rejects(userOne.projects.update({ id: project.id, clientId: deletedClient.id }), /Client not found/u);
    await assert.rejects(userOne.projects.update({ id: project.id, clientId: foreignClient.id }), /Client not found/u);
  });

  it("updates budget, currency, hours, custom fields, and emits update plus status change events", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild", status: "planning" });

    const updated = await caller.projects.update({
      id: project.id,
      status: "active",
      budgetAmount: "1200.50",
      budgetCurrency: "usd",
      estimatedHours: "40.00",
      actualHours: "12.25",
      customFieldSchema: [{ key: "portal", label: "Portal", type: "url", required: true }],
      customFields: { portal: "https://example.com" },
    });

    assert.equal(updated.status, "active");
    assert.equal(updated.budgetAmount, "1200.50");
    assert.equal(updated.budgetCurrency, "USD");
    assert.equal(updated.estimatedHours, "40.00");
    assert.equal(updated.actualHours, "12.25");
    assert.deepEqual(updated.customFields, { portal: "https://example.com" });
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "project.updated", "project.status_changed"],
    );
  });

  it("rejects stale project custom fields and numeric values beyond database precision", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });

    await assert.rejects(caller.projects.update({ id: project.id, customFieldSchema: [{ key: "portal", label: "Portal", type: "url" }], customFields: { portal: "https://example.com", stale: "value" } }), /Unknown custom field: stale/u);
    await assert.rejects(caller.projects.update({ id: project.id, budgetAmount: "12345678901.00" }), /budgetAmount/u);
    await assert.rejects(caller.projects.update({ id: project.id, estimatedHours: "123456789.00" }), /estimatedHours/u);
    await assert.rejects(caller.projects.update({ id: project.id, actualHours: "123456789.00" }), /actualHours/u);
  });

  it("gets and soft-deletes project visibility through user-scoped procedures", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });

    assert.equal((await caller.projects.get({ id: project.id })).name, "Website rebuild");
    await caller.projects.delete({ id: project.id });
    assert.deepEqual(await caller.projects.list({}), []);
    assert.deepEqual(
      (await caller.projects.list({ includeDeleted: true })).map((record) => record.id),
      [project.id],
    );

    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "project.deleted"],
    );
  });

  it("rejects direct deleted project access and keeps repeated delete stable", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });

    const deleted = await caller.projects.delete({ id: project.id });
    const repeatedDelete = await caller.projects.delete({ id: project.id });

    await assert.rejects(caller.projects.get({ id: project.id }), /Project not found/u);
    await assert.rejects(caller.projects.update({ id: project.id, name: "Deleted project" }), /Project not found/u);
    await assert.rejects(caller.projects.updateStatus({ id: project.id, status: "active" }), /Project not found/u);
    assert.deepEqual(repeatedDelete.deletedAt, deleted.deletedAt);
    assert.deepEqual(repeatedDelete.updatedAt, deleted.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "project.deleted"],
    );
  });

  it("manages project tags without allowing cross-user project tagging", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const client = await userOne.clients.create({ name: "Ada Lovelace" });
    const project = await userOne.projects.create({ clientId: client.id, name: "Website rebuild" });
    const tag = await userOne.tags.create({ name: "priority" });

    await userOne.tags.attach({ tagId: tag.id, entityType: "project", entityId: project.id });

    assert.equal((await userOne.tags.listEntity({ entityType: "project", entityId: project.id })).length, 1);
    const events = await eventService.listForUser("user_1");
    assert.deepEqual(
      events.map((event) => event.type),
      ["client.created", "project.created", "tag.created", "project.updated"],
    );
    assert.equal(events.at(-1)?.entity?.type, "project");
    assert.equal(events.at(-1)?.entity?.id, project.id);
    await assert.rejects(userTwo.tags.attach({ tagId: tag.id, entityType: "project", entityId: project.id }), /Tag not found/u);
  });

  it("moves project status through the dedicated status mutation", async () => {
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });

    const updated = await caller.projects.updateStatus({ id: project.id, status: "on_hold" });

    assert.equal(updated.status, "on_hold");
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "project.status_changed"],
    );
  });

  it("treats repeated project status updates as stable no-ops", async () => {
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild", status: "active" });

    const repeated = await caller.projects.updateStatus({ id: project.id, status: "active" });

    assert.deepEqual(repeated.updatedAt, project.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created"],
    );
  });
});

function createTestContext(userId: string, crmRepository: CrmRepository, eventService: EventService): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    crmRepository,
    eventService,
    session: null,
  };
}

function createTestEventService(): EventService {
  let nextId = 0;
  return createEventService({
    repository: createInMemoryEventRepository(),
    idGenerator: () => {
      nextId += 1;
      return `event_${nextId}`;
    },
  });
}
