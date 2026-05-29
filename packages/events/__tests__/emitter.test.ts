import { describe, it, expect, vi, beforeEach } from "vitest";

import { emitEvent, type EventRow, type EventPersister } from "../src/emitter";
import type { EmitEventInput } from "../src/emitter";
import {
  EVENT_TYPE,
  type EventSource,
} from "../src/event-types";

describe("emitEvent", () => {
  let capturedRow: EventRow;
  let persister: EventPersister;

  beforeEach(() => {
    capturedRow = {} as EventRow;

    persister = {
      insert: vi.fn().mockImplementation(async (row: EventRow) => {
        capturedRow = row;
      }),
    };
  });

  it("persists a minimal event with required fields", async () => {
    const input: EmitEventInput = {
      type: EVENT_TYPE.CLIENT_CREATED,
      userId: "user_123",
      source: "app" as EventSource,
      payload: { name: "Acme Corp" },
    };

    const result = await emitEvent(persister, input);

    expect(persister.insert).toHaveBeenCalledTimes(1);

    expect(capturedRow.type).toBe(EVENT_TYPE.CLIENT_CREATED);
    expect(capturedRow.userId).toBe("user_123");
    expect(capturedRow.source).toBe("app");
    expect(capturedRow.payload).toEqual({ name: "Acme Corp" });
    expect(capturedRow.id).toBeDefined();
    expect(typeof capturedRow.id).toBe("string");
    expect(capturedRow.entityType).toBeNull();
    expect(capturedRow.entityId).toBeNull();
    expect(capturedRow.changes).toBeUndefined();

    expect(result.id).toBe(capturedRow.id);
    expect(result.type).toBe(EVENT_TYPE.CLIENT_CREATED);
    expect(result.userId).toBe("user_123");
    expect(result.source).toBe("app");
    expect(result.payload).toEqual({ name: "Acme Corp" });
  });

  it("persists an event with entity reference", async () => {
    const input: EmitEventInput = {
      type: EVENT_TYPE.LEAD_STAGE_CHANGED,
      userId: "user_456",
      source: "api" as EventSource,
      payload: { from: "new", to: "qualified" },
      entity: { type: "lead", id: "lead_789" },
    };

    const result = await emitEvent(persister, input);

    expect(capturedRow.entityType).toBe("lead");
    expect(capturedRow.entityId).toBe("lead_789");

    expect(result.entity).toEqual({ type: "lead", id: "lead_789" });
  });

  it("persists an event with changes (before/after)", async () => {
    const input: EmitEventInput = {
      type: EVENT_TYPE.PROJECT_STATUS_CHANGED,
      userId: "user_abc",
      source: "app" as EventSource,
      payload: {},
      entity: { type: "project", id: "proj_001" },
      changes: {
        before: { status: "planning" },
        after: { status: "active" },
      },
    };

    const result = await emitEvent(persister, input);

    expect(capturedRow.changes).toEqual({
      before: { status: "planning" },
      after: { status: "active" },
    });

    expect(result.changes).toEqual({
      before: { status: "planning" },
      after: { status: "active" },
    });
  });

  it("generates unique IDs for each event", async () => {
    const baseInput: EmitEventInput = {
      type: EVENT_TYPE.CLIENT_CREATED,
      userId: "user_1",
      source: "app" as EventSource,
      payload: {},
    };

    const result1 = await emitEvent(persister, baseInput);
    const result2 = await emitEvent(persister, baseInput);

    expect(result1.id).not.toBe(result2.id);
  });

  it("supports all event sources", async () => {
    const sources: Array<EventSource> = ["app", "email", "webhook", "api", "hook", "system"];

    for (const source of sources) {
      const input: EmitEventInput = {
        type: EVENT_TYPE.SYSTEM_EVENT,
        userId: "user_src",
        source,
        payload: {},
      };

      const result = await emitEvent(persister, input);
      expect(result.source).toBe(source);
    }

    expect(persister.insert).toHaveBeenCalledTimes(sources.length);
  });

  it("persists a webhook-sourced event with payload from external service", async () => {
    const input: EmitEventInput = {
      type: EVENT_TYPE.WEBHOOK_RECEIVED,
      userId: "user_wh",
      source: "webhook" as EventSource,
      payload: {
        externalId: "ext_123",
        action: "payment.completed",
        amount: 2400,
      },
      entity: { type: "client", id: "client_abc" },
    };

    const result = await emitEvent(persister, input);

    expect(result.type).toBe(EVENT_TYPE.WEBHOOK_RECEIVED);
    expect(result.source).toBe("webhook");
    expect(result.payload).toEqual({
      externalId: "ext_123",
      action: "payment.completed",
      amount: 2400,
    });
  });
});
