import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("global search tRPC API", () => {
  it("searches clients, leads, projects, tickets, and exchanges without leaking another user's records", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const client = await userOne.clients.create({ name: "Ada Lovelace", company: "Analytical Engines" });
    const lead = await userOne.leads.create({ name: "Babbage Labs", source: "Analytical referral" });
    const project = await userOne.projects.create({ clientId: client.id, name: "Analytical Engine refresh" });
    const ticket = await userOne.tickets.create({ projectId: project.id, title: "Analytical bug bash" });
    await userOne.exchanges.create({ clientId: client.id, type: "note", body: "Analytical planning note" });
    await userTwo.clients.create({ name: "Hidden Analytical Client" });

    const result = await userOne.search.global({ search: "Analytical" });

    assert.deepEqual(
      [...result.map((item) => item.entityType)].sort(),
      ["client", "exchange", "lead", "project", "ticket"],
    );
    assert.equal(result.some((item) => item.title === "Hidden Analytical Client"), false);
    assert.equal(result.find((item) => item.entityType === "lead")?.entityId, lead.id);
    assert.equal(result.find((item) => item.entityType === "ticket")?.entityId, ticket.id);
  });

  it("filters global search by entity type and status while list queries filter by tags", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const activeProject = await caller.projects.create({ clientId: client.id, name: "Portal rebuild", status: "active" });
    await caller.projects.create({ clientId: client.id, name: "Portal archive", status: "archived" });
    const tag = await caller.tags.create({ name: "priority" });
    await caller.tags.attach({ tagId: tag.id, entityType: "project", entityId: activeProject.id });

    const searchResult = await caller.search.global({ search: "Portal", entityTypes: ["project"], status: "active" });
    const taggedProjects = await caller.projects.list({ tagIds: [tag.id] });

    assert.deepEqual(searchResult.map((item) => item.entityId), [activeProject.id]);
    assert.deepEqual(taggedProjects.map((project) => project.id), [activeProject.id]);
  });

  it("excludes entity types whose status domain does not contain the requested status", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const activeProject = await caller.projects.create({ clientId: client.id, name: "Portal rebuild", status: "active" });
    const projectForTicket = await caller.projects.create({ clientId: client.id, name: "Support project" });
    await caller.leads.create({ name: "Portal lead", stage: "new" });
    await caller.tickets.create({ projectId: projectForTicket.id, title: "Portal ticket", status: "open" });

    const result = await caller.search.global({ search: "Portal", status: "active" });

    assert.deepEqual(result.map((item) => item.entityType), ["project"]);
    assert.deepEqual(result.map((item) => item.entityId), [activeProject.id]);
  });

  it("treats date-only dateTo filters as inclusive through the selected day", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const input = JSON.parse(JSON.stringify({ entityTypes: ["client"], dateTo: new Date().toISOString().slice(0, 10) })) as Parameters<typeof caller.search.global>[0];

    const result = await caller.search.global(input);

    assert.deepEqual(result.map((item) => item.entityId), [client.id]);
  });

  it("treats date-only dateFrom filters as inclusive from the selected day", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const input = JSON.parse(JSON.stringify({ entityTypes: ["client"], dateFrom: new Date().toISOString().slice(0, 10) })) as Parameters<typeof caller.search.global>[0];

    const result = await caller.search.global(input);

    assert.deepEqual(result.map((item) => item.entityId), [client.id]);
  });

  it("rejects unbounded empty global search requests", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(caller.search.global({}), /Global search requires/u);
  });

  it("returns bounded exchange snippets instead of full bodies", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const privateBody = `Needle ${"private ".repeat(40)}secret tail`;
    await caller.exchanges.create({ clientId: client.id, type: "note", body: privateBody });

    const result = await caller.search.global({ search: "Needle", entityTypes: ["exchange"] });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.title.includes("secret tail"), false);
    assert.equal(result[0]?.description?.includes("secret tail"), false);
    assert.ok((result[0]?.description?.length ?? 0) <= 161);
  });

  it("does not let exchangeType-only searches leak unfiltered non-exchange records", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    await caller.leads.create({ name: "Babbage Labs" });
    await caller.projects.create({ clientId: client.id, name: "Portal rebuild" });
    const note = await caller.exchanges.create({ clientId: client.id, type: "note", body: "Internal planning note" });
    await caller.exchanges.create({ clientId: client.id, type: "call", body: "Client call" });

    const result = await caller.search.global({ exchangeType: "note" });

    assert.deepEqual(result.map((item) => item.entityType), ["exchange"]);
    assert.deepEqual(result.map((item) => item.entityId), [note.id]);
  });

  it("rejects exchangeType filters when exchange results are excluded", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));

    await assert.rejects(caller.search.global({ entityTypes: ["client"], exchangeType: "note" }), /exchangeType can only be used/u);
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
