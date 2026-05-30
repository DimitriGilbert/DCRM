import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository, isCoreEventType } from "./index.js";

describe("event emission", () => {
  it("persists a normalized user-scoped event through the public event service", async () => {
    const repository = createInMemoryEventRepository();
    const service = createEventService({
      clock: () => new Date("2026-05-30T12:00:00.000Z"),
      idGenerator: () => "event_1",
      repository,
    });

    const event = await service.emit({
      type: "client.created",
      userId: "user_1",
      source: "app",
      entity: {
        type: "client",
        id: "client_1",
      },
      payload: {
        name: "Ada Lovelace",
      },
      changes: {
        before: {
          name: "Ada",
        },
        after: {
          name: "Ada Lovelace",
        },
      },
    });

    assert.deepEqual(event, {
      id: "event_1",
      type: "client.created",
      userId: "user_1",
      source: "app",
      entity: {
        type: "client",
        id: "client_1",
      },
      payload: {
        name: "Ada Lovelace",
      },
      changes: {
        before: {
          name: "Ada",
        },
        after: {
          name: "Ada Lovelace",
        },
      },
      metadata: {},
      createdAt: new Date("2026-05-30T12:00:00.000Z"),
    });

    assert.deepEqual(await service.listForUser("user_1"), [event]);
  });

  it("lists only events that belong to the requested user", async () => {
    const service = createEventService({
      idGenerator: createSequentialIdGenerator(),
      repository: createInMemoryEventRepository(),
    });

    const firstUserEvent = await service.emitApp({ type: "client.created", userId: "user_1" });
    await service.emitApp({ type: "client.created", userId: "user_2" });

    assert.deepEqual(await service.listForUser("user_1"), [firstUserEvent]);
  });

  it("rejects emission when a user id is not provided", async () => {
    const service = createEventService({
      idGenerator: () => "event_2",
      repository: createInMemoryEventRepository(),
    });

    await assert.rejects(
      service.emit({
        type: "client.updated",
        userId: "",
        source: "api",
        payload: {},
      }),
      /userId is required/u,
    );
  });

  it("provides source-specific public emission APIs for every supported event source", async () => {
    const service = createEventService({
      clock: () => new Date("2026-05-30T12:00:00.000Z"),
      idGenerator: createSequentialIdGenerator(),
      repository: createInMemoryEventRepository(),
    });

    await service.emitApp({ type: "client.created", userId: "user_1" });
    await service.emitApi({ type: "lead.created", userId: "user_1" });
    await service.emitEmail({ type: "exchange.exchange_received", userId: "user_1" });
    await service.emitWebhook({ type: "webhook.webhook_received", userId: "user_1" });
    await service.emitHook({ type: "ticket.status_changed", userId: "user_1" });
    await service.emitSystem({ type: "import.import_completed", userId: "user_1" });

    assert.deepEqual(
      (await service.listForUser("user_1")).map((event) => event.source),
      ["app", "api", "email", "webhook", "hook", "system"],
    );
  });

  it("exposes a public guard for supported core event types", () => {
    assert.equal(isCoreEventType("client.created"), true);
    assert.equal(isCoreEventType("lead.converted"), true);
    assert.equal(isCoreEventType(""), false);
    assert.equal(isCoreEventType("client.archived"), false);
  });
});

function createSequentialIdGenerator() {
  let nextId = 0;
  return () => {
    nextId += 1;
    return `event_${nextId}`;
  };
}
