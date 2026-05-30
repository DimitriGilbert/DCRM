import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("import/export tRPC API", () => {
  it("imports clients from CSV for the current user and emits import events", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));

    const result = await caller.importExport.importClientsCsv({
      csv: "name,email,company\nAda Lovelace,ada@example.com,Analytical Engines\nGrace Hopper,grace@example.com,Compilers Inc",
    });

    assert.deepEqual(result, { importedCount: 2, skippedCount: 0 });
    assert.deepEqual(
      (await caller.clients.list({})).map((client) => client.name),
      ["Ada Lovelace", "Grace Hopper"],
    );
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "client.created", "import.import_completed"],
    );
  });

  it("exports CSV cells with spreadsheet-leading characters as inert text", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));

    await caller.clients.create({
      name: "=HYPERLINK(\"https://attacker.example\",\"click\")",
      email: "+danger@example.com",
      phone: "-danger",
      company: "@Acme",
      notes: "\t=cmd",
    });

    const result = await caller.importExport.exportList({ entity: "clients", format: "csv" });

    assert.match(result.content, /"'=HYPERLINK/u);
    assert.match(result.content, /'\+danger@example\.com/u);
    assert.match(result.content, /'-danger/u);
    assert.match(result.content, /'@Acme/u);
    assert.match(result.content, /'\t=cmd/u);
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
