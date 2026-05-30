import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("clients tRPC API", () => {
  it("creates a user-scoped client and emits a client.created event", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));

    const client = await caller.clients.create({ name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines" });

    assert.equal(client.userId, "user_1");
    assert.equal(client.name, "Ada Lovelace");
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created"],
    );
  });

  it("searches active clients by core fields without leaking another user's records", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    await appRouter.createCaller(createTestContext("user_1", crmRepository, eventService)).clients.create({ name: "Ada Lovelace", company: "Analytical Engines" });
    await appRouter.createCaller(createTestContext("user_2", crmRepository, eventService)).clients.create({ name: "Grace Hopper", company: "Analytical Engines" });

    const result = await appRouter.createCaller(createTestContext("user_1", crmRepository, eventService)).clients.list({ search: "Analytical" });

    assert.deepEqual(
      result.map((client) => client.name),
      ["Ada Lovelace"],
    );
  });

  it("searches active clients by phone number as a core client field", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    await caller.clients.create({ name: "Ada Lovelace", phone: "+1 555 0100" });

    const result = await caller.clients.list({ search: "555" });

    assert.deepEqual(
      result.map((client) => client.name),
      ["Ada Lovelace"],
    );
  });

  it("soft-deletes and restores a client through user-scoped mutations", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await caller.clients.delete({ id: client.id });
    assert.deepEqual(await caller.clients.list({}), []);
    assert.equal((await caller.clients.list({ includeDeleted: true })).length, 1);

    await caller.clients.restore({ id: client.id });
    assert.deepEqual(
      (await caller.clients.list({})).map((record) => record.id),
      [client.id],
    );
  });

  it("rejects direct access to deleted clients and keeps delete and restore idempotent", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    const deleted = await caller.clients.delete({ id: client.id });
    const repeatedDelete = await caller.clients.delete({ id: client.id });
    await assert.rejects(caller.clients.get({ id: client.id }), /Client not found/u);
    await assert.rejects(caller.clients.update({ id: client.id, name: "Deleted client" }), /Client not found/u);

    assert.deepEqual(repeatedDelete.deletedAt, deleted.deletedAt);
    assert.deepEqual(repeatedDelete.updatedAt, deleted.updatedAt);
    const restored = await caller.clients.restore({ id: client.id });
    const repeatedRestore = await caller.clients.restore({ id: client.id });
    assert.deepEqual(repeatedRestore.updatedAt, restored.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "client.deleted", "client.restored"],
    );
  });

  it("rejects empty client update patches without emitting update events", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(caller.clients.update({ id: client.id }), /At least one client field/u);
    await assert.rejects(caller.clients.update({ id: client.id, customFieldSchema: [] }), /At least one client field/u);

    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created"],
    );
  });

  it("validates client custom fields against the submitted custom field schema", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));

    const client = await caller.clients.create({
      name: "Ada Lovelace",
      customFieldSchema: [{ key: "hourlyRate", label: "Hourly rate", type: "number", required: true }],
      customFields: { hourlyRate: 125 },
    });

    assert.deepEqual(client.customFields, { hourlyRate: 125 });
    await assert.rejects(caller.clients.create({ name: "Grace Hopper", customFields: { stale: "value" } }), /Unknown custom field: stale/u);
    await assert.rejects(
      caller.clients.update({ id: client.id, customFieldSchema: [{ key: "portal", label: "Portal", type: "url", required: true }], customFields: { portal: "not-a-url" } }),
      /Invalid URL/u,
    );
    await assert.rejects(
      caller.clients.create({
        name: "Duplicate Fields",
        customFieldSchema: [
          { key: "portal", label: "Portal", type: "url" },
          { key: "portal", label: "Duplicate portal", type: "text" },
        ],
        customFields: { portal: "https://example.com" },
      }),
      /Duplicate custom field key: portal/u,
    );
  });

  it("manages tags and client entity tags without crossing user scope", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const client = await userOne.clients.create({ name: "Ada Lovelace" });
    const tag = await userOne.tags.create({ name: "vip", color: "#f59e0b" });

    await userOne.tags.attach({ tagId: tag.id, entityType: "client", entityId: client.id });

    assert.equal((await userOne.tags.listEntity({ entityType: "client", entityId: client.id })).length, 1);
    await assert.rejects(userTwo.tags.attach({ tagId: tag.id, entityType: "client", entityId: client.id }), /Tag not found/u);
  });

  it("lists only active entity tags for active entities", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const activeTag = await caller.tags.create({ name: "active" });
    const deletedTag = await caller.tags.create({ name: "deleted" });
    await caller.tags.attach({ tagId: activeTag.id, entityType: "client", entityId: client.id });
    await caller.tags.attach({ tagId: deletedTag.id, entityType: "client", entityId: client.id });
    await caller.tags.delete({ id: deletedTag.id });

    assert.deepEqual(
      (await caller.tags.listEntity({ entityType: "client", entityId: client.id })).map((entityTag) => entityTag.tagId),
      [activeTag.id],
    );

    await caller.clients.delete({ id: client.id });
    assert.deepEqual(await caller.tags.listEntity({ entityType: "client", entityId: client.id }), []);
  });

  it("rejects entity tag types outside the current public tags API", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const tag = await caller.tags.create({ name: "vip" });

    const listInput = JSON.parse(JSON.stringify({ entityType: "ticket", entityId: "ticket_1" })) as Parameters<typeof caller.tags.listEntity>[0];
    const detachInput = JSON.parse(JSON.stringify({ tagId: tag.id, entityType: "lead", entityId: "lead_1" })) as Parameters<typeof caller.tags.detach>[0];

    await assert.rejects(caller.tags.listEntity(listInput), /Invalid option/u);
    await assert.rejects(caller.tags.detach(detachInput), /Invalid option/u);
  });

  it("updates tag fields without forwarding the route id as an update field", async () => {
    const crmRepository = createTagUpdateFieldAssertingRepository(createInMemoryCrmRepository());
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, createTestEventService()));
    const tag = await caller.tags.create({ name: "vip" });

    const updated = await caller.tags.update({ id: tag.id, name: "priority" });

    assert.equal(updated.id, tag.id);
    assert.equal(updated.name, "priority");
  });

  it("rejects empty tag updates without touching updatedAt or emitting an update event", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const tag = await caller.tags.create({ name: "vip" });

    await assert.rejects(caller.tags.update({ id: tag.id }), /At least one tag field must be provided/u);

    const persisted = await crmRepository.tags.getById({ userId: "user_1", id: tag.id });
    assert.equal(persisted?.updatedAt, tag.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["tag.created"],
    );
  });

  it("rejects updates to deleted tags without emitting an update event", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const tag = await caller.tags.create({ name: "vip" });
    await caller.tags.delete({ id: tag.id });
    const deleted = await crmRepository.tags.getById({ userId: "user_1", id: tag.id });

    await assert.rejects(caller.tags.update({ id: tag.id, name: "priority" }), /NOT_FOUND|Tag not found/u);

    const persisted = await crmRepository.tags.getById({ userId: "user_1", id: tag.id });
    assert.equal(persisted?.name, "vip");
    assert.equal(persisted?.updatedAt, deleted?.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["tag.created", "tag.deleted"],
    );
  });

  it("emits project.updated when detaching a project tag", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Portal" });
    const tag = await caller.tags.create({ name: "vip" });

    await caller.tags.attach({ tagId: tag.id, entityType: "project", entityId: project.id });
    await caller.tags.detach({ tagId: tag.id, entityType: "project", entityId: project.id });

    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "tag.created", "project.updated", "project.updated"],
    );
  });

  it("returns stable conflicts for duplicate tag names including soft-deleted tags", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const reserved = await caller.tags.create({ name: "vip" });
    const other = await caller.tags.create({ name: "priority" });
    await caller.tags.delete({ id: reserved.id });

    await assert.rejects(caller.tags.create({ name: "vip" }), /CONFLICT|Tag name is already reserved/u);
    await assert.rejects(caller.tags.update({ id: other.id, name: "vip" }), /CONFLICT|Tag name is already reserved/u);
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

function createTagUpdateFieldAssertingRepository(base: CrmRepository): CrmRepository {
  return {
    ...base,
    tags: {
      ...base.tags,
      async update(input) {
        assert.equal(Object.hasOwn(input.fields, "id"), false);
        return base.tags.update(input);
      },
    },
  };
}
