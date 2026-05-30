import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("dashboard tRPC API", () => {
  it("summarizes the signed-in user's active CRM work", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const otherUser = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));

    const client = await caller.clients.create({ name: "Ada Lovelace" });
    await otherUser.clients.create({ name: "Grace Hopper" });
    const lead = await caller.leads.create({ name: "Analytical Engines", stage: "qualified", estimatedValueAmount: "1200.00", estimatedValueCurrency: "USD" });
    const project = await caller.projects.create({ clientId: client.id, name: "Calculator launch", status: "active", dueAt: new Date("2027-01-15T00:00:00.000Z") });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Ship prototype", status: "open", dueAt: new Date("2027-01-10T00:00:00.000Z") });
    await caller.exchanges.create({ clientId: client.id, type: "note", body: "Kickoff notes", occurredAt: new Date("2027-01-01T12:00:00.000Z") });

    const summary = await caller.dashboard.summary();

    assert.equal(summary.metrics.activeClients, 1);
    assert.equal(summary.metrics.activeProjects, 1);
    assert.equal(summary.metrics.openTickets, 1);
    assert.deepEqual(summary.leadPipeline.map((stage) => [stage.stage, stage.count, stage.estimatedValue]), [["qualified", 1, "1200.00 USD"]]);
    assert.deepEqual(summary.upcomingDeadlines.map((deadline) => [deadline.kind, deadline.title]), [["ticket", ticket.title], ["project", project.name]]);
    assert.deepEqual(summary.recentActivity.map((activity) => [activity.kind, activity.title]), [["note", "Kickoff notes"]]);
    assert.equal(summary.leadPipeline[0]?.leadIds[0], lead.id);
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
