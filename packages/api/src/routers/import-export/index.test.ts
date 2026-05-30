import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EventService } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";
import { IMPORT_CLIENTS_CSV_MAX_BYTES, IMPORT_CLIENTS_CSV_MAX_ROWS } from "./schemas.js";

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
    const events = await eventService.listForUser("user_1");
    assert.deepEqual(
      events.map((event) => event.type),
      ["client.created", "client.created", "import.import_completed"],
    );
    assert.equal(events[2]?.entity?.type, "import");
    assert.match(events[2]?.entity?.id ?? "", /^[0-9a-f-]{36}$/u);
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

  it("rejects invalid client CSV rows before importing any rows", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));

    await assert.rejects(
      caller.importExport.importClientsCsv({ csv: "name,email\nAda Lovelace,ada@example.com\nGrace Hopper,not-an-email" }),
      /Invalid client CSV row/u,
    );

    assert.deepEqual(await caller.clients.list({}), []);
    assert.deepEqual(await eventService.listForUser("user_1"), []);
  });

  it("emits explicit row completion state when CSV persistence fails mid-import", async () => {
    const baseRepository = createInMemoryCrmRepository();
    const crmRepository = createSecondClientCreateFailingRepository(baseRepository);
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));

    await assert.rejects(
      caller.importExport.importClientsCsv({ csv: "name,email\nAda Lovelace,ada@example.com\nGrace Hopper,grace@example.com" }),
      /Some rows may have been imported/u,
    );

    assert.deepEqual(
      (await baseRepository.clients.list({ userId: "user_1" })).map((client) => client.name),
      ["Ada Lovelace"],
    );
    const events = await eventService.listForUser("user_1");
    assert.deepEqual(
      events.map((event) => event.type),
      ["import.import_failed"],
    );
    assert.equal(events[0]?.entity?.type, "import");
    assert.match(events[0]?.entity?.id ?? "", /^[0-9a-f-]{36}$/u);
    assert.deepEqual(events[0]?.payload, {
      entityType: "client",
      importedCount: 1,
      skippedCount: 0,
      failedRowNumber: 2,
      source: "csv",
      rowResults: [
        { rowNumber: 1, status: "imported", clientId: (await baseRepository.clients.list({ userId: "user_1" }))[0]?.id },
        { rowNumber: 2, status: "failed" },
      ],
    });
  });

  it("rejects CSV imports over the configured row limit", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const rows = Array.from({ length: IMPORT_CLIENTS_CSV_MAX_ROWS + 1 }, (_value, index) => `Client ${index},client${index}@example.com`);

    await assert.rejects(caller.importExport.importClientsCsv({ csv: `name,email\n${rows.join("\n")}` }), /maximum row count/u);
  });

  it("rejects CSV imports over the configured byte limit", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const csv = `name,notes\nAda Lovelace,${"x".repeat(IMPORT_CLIENTS_CSV_MAX_BYTES)}`;

    await assert.rejects(caller.importExport.importClientsCsv({ csv }), /maximum payload size/u);
  });

  it("exports all notifications without a silent one thousand row cutoff", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, createTestEventService()));

    for (let index = 0; index < 1_001; index += 1) {
      await caller.notifications.create({ title: `Notification ${index}` });
    }

    const result = await caller.importExport.exportAll();

    assert.equal(result.data.notifications.length, 1_001);
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

function createSecondClientCreateFailingRepository(base: CrmRepository): CrmRepository {
  let createCount = 0;
  return {
    ...base,
    clients: {
      ...base.clients,
      async create(input) {
        createCount += 1;
        if (createCount === 2) {
          throw new Error("simulated persistence failure");
        }
        return base.clients.create(input);
      },
    },
  };
}
