import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("leads tRPC API", () => {
  it("creates a user-scoped lead in a fixed stage and emits a lead.created event", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));

    const lead = await caller.leads.create({ name: "Ada Lovelace", email: "ada@example.com", stage: "qualified", source: "referral" });

    assert.equal(lead.userId, "user_1");
    assert.equal(lead.stage, "qualified");
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["lead.created"],
    );
  });

  it("lists active leads by stage and search without leaking another user's records", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    await userOne.leads.create({ name: "Ada Lovelace", company: "Analytical Engines", stage: "qualified" });
    await userOne.leads.create({ name: "Charles Babbage", company: "Difference Engines", stage: "new" });
    await userTwo.leads.create({ name: "Grace Hopper", company: "Analytical Engines", stage: "qualified" });

    const result = await userOne.leads.list({ search: "Analytical", stage: "qualified" });

    assert.deepEqual(
      result.map((lead) => lead.name),
      ["Ada Lovelace"],
    );
  });

  it("returns a kanban-friendly fixed-stage pipeline grouping", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    await caller.leads.create({ name: "Ada Lovelace", stage: "qualified" });
    await caller.leads.create({ name: "Charles Babbage", stage: "proposal" });

    const pipeline = await caller.leads.pipeline({});

    assert.deepEqual(
      pipeline.map((column) => column.stage),
      ["new", "contacted", "qualified", "proposal", "won", "lost"],
    );
    assert.deepEqual(
      pipeline.map((column) => column.leads.map((lead) => lead.name)),
      [[], [], ["Ada Lovelace"], ["Charles Babbage"], [], []],
    );
  });

  it("updates lead fields, emits update and stage change events, and soft-deletes leads", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const lead = await caller.leads.create({ name: "Ada Lovelace", stage: "new" });

    const updated = await caller.leads.update({ id: lead.id, company: "Analytical Engines", stage: "proposal" });
    await caller.leads.delete({ id: lead.id });

    assert.equal(updated.company, "Analytical Engines");
    assert.deepEqual(await caller.leads.list({}), []);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["lead.created", "lead.updated", "lead.stage_changed", "lead.deleted"],
    );
  });

  it("moves a lead stage through the dedicated pipeline mutation", async () => {
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), eventService));
    const lead = await caller.leads.create({ name: "Ada Lovelace" });

    const updated = await caller.leads.updateStage({ id: lead.id, stage: "contacted" });

    assert.equal(updated.stage, "contacted");
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["lead.created", "lead.stage_changed"],
    );
  });

  it("converts a won lead into a client while preserving the lead as converted history", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const lead = await caller.leads.create({ name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", stage: "proposal" });

    const result = await caller.leads.convert({ id: lead.id });

    assert.equal(result.client.name, "Ada Lovelace");
    assert.equal(result.client.email, "ada@example.com");
    assert.equal(result.lead.convertedClientId, result.client.id);
    assert.equal(result.lead.stage, "won");
    assert.equal((await caller.leads.list({})).length, 0);
    assert.deepEqual(
      (await caller.leads.list({ includeConverted: true })).map((record) => record.id),
      [lead.id],
    );
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["lead.created", "lead.stage_changed", "lead.converted", "client.created"],
    );
  });

  it("rejects converting the same lead twice without creating another client", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const lead = await caller.leads.create({ name: "Ada Lovelace", stage: "proposal" });

    await caller.leads.convert({ id: lead.id });
    await assert.rejects(caller.leads.convert({ id: lead.id }), /Lead has already been converted/u);

    assert.equal((await caller.clients.list({})).length, 1);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["lead.created", "lead.stage_changed", "lead.converted", "client.created"],
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
