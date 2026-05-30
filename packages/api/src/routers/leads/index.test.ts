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

  it("applies accepted pipeline date filters instead of silently ignoring them", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    await caller.leads.create({ name: "Ada Lovelace", stage: "qualified" });

    const pipeline = await caller.leads.pipeline({ createdTo: new Date("2000-01-01T00:00:00.000Z") });
    const createdFromPipeline = await caller.leads.pipeline({ createdFrom: new Date("2999-01-01T00:00:00.000Z") });

    assert.deepEqual(
      pipeline.map((column) => column.leads),
      [[], [], [], [], [], []],
    );
    assert.deepEqual(
      createdFromPipeline.map((column) => column.leads),
      [[], [], [], [], [], []],
    );
  });

  it("applies accepted pipeline tag filters", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, createTestEventService()));
    const taggedLead = await caller.leads.create({ name: "Ada Lovelace", stage: "qualified" });
    await caller.leads.create({ name: "Charles Babbage", stage: "qualified" });
    const tag = await caller.tags.create({ name: "priority" });
    await crmRepository.entityTags.attach({ userId: "user_1", tagId: tag.id, entityType: "lead", entityId: taggedLead.id, now: new Date() });

    const pipeline = await caller.leads.pipeline({ tagIds: [tag.id] });

    assert.deepEqual(
      pipeline.map((column) => column.leads.map((lead) => lead.name)),
      [[], [], ["Ada Lovelace"], [], [], []],
    );
  });

  it("normalizes lead estimated value currency based on amount presence", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));

    const withoutAmount = await caller.leads.create({ name: "No budget", estimatedValueCurrency: "USD" });
    const withAmount = await caller.leads.create({ name: "Budgeted", estimatedValueAmount: "1200.00", estimatedValueCurrency: "USD" });
    const changedCurrency = await caller.leads.update({ id: withAmount.id, estimatedValueCurrency: "EUR" });
    const clearedAmount = await caller.leads.update({ id: withAmount.id, estimatedValueAmount: null });
    const currencyWithoutAmount = await caller.leads.update({ id: withoutAmount.id, estimatedValueCurrency: "GBP" });

    assert.equal(withoutAmount.estimatedValueCurrency, null);
    assert.equal(changedCurrency.estimatedValueAmount, "1200.00");
    assert.equal(changedCurrency.estimatedValueCurrency, "EUR");
    assert.equal(clearedAmount.estimatedValueAmount, null);
    assert.equal(clearedAmount.estimatedValueCurrency, null);
    assert.equal(currencyWithoutAmount.estimatedValueCurrency, null);
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

  it("rejects reading a soft-deleted lead through the direct get API", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const lead = await caller.leads.create({ name: "Deleted lead" });
    await caller.leads.delete({ id: lead.id });

    await assert.rejects(caller.leads.get({ id: lead.id }), /Lead not found/u);
    assert.deepEqual(
      (await caller.leads.list({ includeDeleted: true })).map((record) => record.id),
      [lead.id],
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
    const lead = await caller.leads.create({ name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", stage: "won" });

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
      ["lead.created", "lead.converted", "client.created"],
    );
  });

  it("rejects converting leads before they reach the won stage", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const lead = await caller.leads.create({ name: "Ada Lovelace", stage: "proposal" });

    await assert.rejects(caller.leads.convert({ id: lead.id }), /Only won leads can be converted/u);
  });

  it("enforces lead transition invariants at the repository write boundary", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const proposalLead = await crmRepository.leads.create({ id: "lead_proposal", userId: "user_1", fields: { name: "Proposal", stage: "proposal" }, now });

    assert.equal(await crmRepository.leads.convert({ userId: "user_1", leadId: proposalLead.id, clientId: "client_from_proposal", now }), undefined);

    const wonLead = await crmRepository.leads.create({ id: "lead_won", userId: "user_1", fields: { name: "Won", stage: "won" }, now });
    await crmRepository.leads.convert({ userId: "user_1", leadId: wonLead.id, clientId: "client_from_won", now });

    assert.equal(await crmRepository.leads.update({ userId: "user_1", id: wonLead.id, fields: { stage: "lost" }, now }), undefined);
    assert.equal(await crmRepository.leads.update({ userId: "user_1", id: wonLead.id, fields: { stage: "won" }, now, expectedStage: "lost" }), undefined);

    const renamed = await crmRepository.leads.update({ userId: "user_1", id: wonLead.id, fields: { name: "Converted Won" }, now });
    assert.equal(renamed?.name, "Converted Won");
    assert.equal(renamed?.stage, "won");
  });

  it("rejects converting the same lead twice without creating another client", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const lead = await caller.leads.create({ name: "Ada Lovelace", stage: "won" });

    await caller.leads.convert({ id: lead.id });
    await assert.rejects(caller.leads.convert({ id: lead.id }), /Lead has already been converted/u);

    assert.equal((await caller.clients.list({})).length, 1);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["lead.created", "lead.converted", "client.created"],
    );
  });

  it("rejects deleted lead mutations and converted lead stage regressions", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const deletedLead = await caller.leads.create({ name: "Deleted lead" });
    await caller.leads.delete({ id: deletedLead.id });

    await assert.rejects(caller.leads.update({ id: deletedLead.id, name: "Changed" }), /Lead not found/u);
    await assert.rejects(caller.leads.updateStage({ id: deletedLead.id, stage: "qualified" }), /Lead not found/u);
    await assert.rejects(caller.leads.convert({ id: deletedLead.id }), /Lead not found/u);

    const convertedLead = await caller.leads.create({ name: "Converted lead", stage: "won" });
    await caller.leads.convert({ id: convertedLead.id });

    await assert.rejects(caller.leads.update({ id: convertedLead.id, stage: "lost" }), /Converted leads must remain in the won stage/u);
    await assert.rejects(caller.leads.updateStage({ id: convertedLead.id, stage: "qualified" }), /Converted leads must remain in the won stage/u);
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
