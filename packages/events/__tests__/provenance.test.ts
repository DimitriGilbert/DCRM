import { describe, it, expect, vi, beforeEach } from "vitest";

import type { DcrmEvent } from "../src/emitter";
import { emitEvent, type EventPersister, type EventRow } from "../src/emitter";
import type { EmitEventInput } from "../src/emitter";
import { EVENT_TYPE, type EventSource } from "../src/event-types";
import {
  dispatchHooks,
  type ExecutionRecord,
  type ExecutionStore,
} from "../src/executor";
import type { HookQueryFn, HookRecord } from "../src/hook-resolver";
import type { ProvenanceMeta } from "../src/provenance";
import {
  createProvenanceTracker,
  shouldDispatchHooksForEvent,
} from "../src/provenance";
import type { HookJobData, QueueAdapter } from "../src/queue";

// --- Shared helpers ---

function makeEvent(overrides?: Partial<DcrmEvent>): DcrmEvent {
  return {
    id: "evt_1",
    type: EVENT_TYPE.CLIENT_CREATED,
    userId: "user_1",
    source: "app",
    payload: { name: "Acme" },
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeHook(
  overrides: Partial<HookRecord> & { id: string },
): HookRecord {
  return {
    userId: "user_1",
    name: "Test Hook",
    type: "ai",
    eventType: EVENT_TYPE.CLIENT_CREATED,
    enabled: true,
    config: {},
    maxRetries: 3,
    ...overrides,
  };
}

function createStore(): {
  records: Map<string, ExecutionRecord>;
  store: ExecutionStore;
} {
  const records = new Map<string, ExecutionRecord>();

  const store: ExecutionStore = {
    insert: vi.fn().mockImplementation(async (record: ExecutionRecord) => {
      records.set(record.id, { ...record });
    }),
    updateStatus: vi
      .fn()
      .mockImplementation(
        async (
          id: string,
          status: "pending" | "running" | "success" | "failed",
          details?: {
            output?: Record<string, unknown>;
            error?: string;
          },
        ) => {
          const existing = records.get(id);
          if (existing !== undefined) {
            records.set(id, {
              ...existing,
              status,
              output: details?.output ?? existing.output,
              error: details?.error ?? existing.error,
            });
          }
        },
      ),
  };

  return { records, store };
}

function createSpyQueue(): {
  jobs: HookJobData[];
  queue: QueueAdapter;
} {
  const jobs: HookJobData[] = [];
  const queue: QueueAdapter = {
    addJob: vi.fn().mockImplementation(async (data: HookJobData) => {
      jobs.push(data);
    }),
  };
  return { jobs, queue };
}

const defaultProvenance: ProvenanceMeta = {
  sourceHookExecutionId: "exec_hook_1",
  sourceEventId: "evt_original",
  emitDownstreamEvents: false,
};

// --- Tests ---

describe("createProvenanceTracker", () => {
  it("starts with inactive context", () => {
    const tracker = createProvenanceTracker();
    const ctx = tracker.getContext();

    expect(ctx.isActive).toBe(false);
    expect(ctx.meta).toBeUndefined();
  });

  it("activates context with metadata on enterHookContext", () => {
    const tracker = createProvenanceTracker();
    tracker.enterHookContext(defaultProvenance);
    const ctx = tracker.getContext();

    expect(ctx.isActive).toBe(true);
    expect(ctx.meta).toEqual(defaultProvenance);
  });

  it("deactivates context on exitHookContext", () => {
    const tracker = createProvenanceTracker();
    tracker.enterHookContext(defaultProvenance);
    tracker.exitHookContext();
    const ctx = tracker.getContext();

    expect(ctx.isActive).toBe(false);
    expect(ctx.meta).toBeUndefined();
  });

  it("replaces metadata on re-entry without exit", () => {
    const tracker = createProvenanceTracker();

    const firstMeta: ProvenanceMeta = {
      sourceHookExecutionId: "exec_1",
      sourceEventId: "evt_1",
      emitDownstreamEvents: false,
    };
    const secondMeta: ProvenanceMeta = {
      sourceHookExecutionId: "exec_2",
      sourceEventId: "evt_2",
      emitDownstreamEvents: true,
    };

    tracker.enterHookContext(firstMeta);
    expect(tracker.getContext().meta).toEqual(firstMeta);

    tracker.enterHookContext(secondMeta);
    expect(tracker.getContext().meta).toEqual(secondMeta);
  });
});

describe("shouldDispatchHooksForEvent", () => {
  it("returns true for events without provenance", () => {
    const event = makeEvent();
    expect(shouldDispatchHooksForEvent(event)).toBe(true);
  });

  it("returns false when emitDownstreamEvents is false", () => {
    const event = makeEvent({
      provenance: {
        sourceHookExecutionId: "exec_1",
        sourceEventId: "evt_1",
        emitDownstreamEvents: false,
      },
    });
    expect(shouldDispatchHooksForEvent(event)).toBe(false);
  });

  it("returns true when emitDownstreamEvents is true", () => {
    const event = makeEvent({
      provenance: {
        sourceHookExecutionId: "exec_1",
        sourceEventId: "evt_1",
        emitDownstreamEvents: true,
      },
    });
    expect(shouldDispatchHooksForEvent(event)).toBe(true);
  });
});

describe("dispatchHooks — provenance loop suppression", () => {
  const hooks = [makeHook({ id: "h1", type: "ai" })];
  const queryFn: HookQueryFn = vi.fn().mockResolvedValue(hooks);

  it("does NOT dispatch hooks for hook-driven event by default", async () => {
    const event = makeEvent({
      provenance: defaultProvenance,
    });
    const { store } = createStore();
    const { jobs, queue } = createSpyQueue();

    const result = await dispatchHooks(event, queryFn, store, queue);

    expect(result).toHaveLength(0);
    expect(jobs).toHaveLength(0);
  });

  it("DOES dispatch hooks when emitDownstreamEvents is true", async () => {
    const event = makeEvent({
      provenance: {
        sourceHookExecutionId: "exec_hook_1",
        sourceEventId: "evt_original",
        emitDownstreamEvents: true,
      },
    });
    const { store } = createStore();
    const { jobs, queue } = createSpyQueue();

    const result = await dispatchHooks(event, queryFn, store, queue);

    expect(result).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.hookId).toBe("h1");
  });

  it("always dispatches for events without provenance", async () => {
    const event = makeEvent();
    const { store } = createStore();
    const { jobs, queue } = createSpyQueue();

    const result = await dispatchHooks(event, queryFn, store, queue);

    expect(result).toHaveLength(1);
    expect(jobs).toHaveLength(1);
  });
});

describe("emitEvent — provenance passthrough", () => {
  let persister: EventPersister;

  beforeEach(() => {
    persister = {
      insert: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("includes provenance in the returned event when provided", async () => {
    const input: EmitEventInput = {
      type: EVENT_TYPE.CLIENT_UPDATED,
      userId: "user_1",
      source: "hook" as EventSource,
      payload: { field: "name" },
      provenance: {
        sourceHookExecutionId: "exec_42",
        sourceEventId: "evt_trigger",
        emitDownstreamEvents: false,
      },
    };

    const result = await emitEvent(persister, input);

    expect(result.provenance).toEqual({
      sourceHookExecutionId: "exec_42",
      sourceEventId: "evt_trigger",
      emitDownstreamEvents: false,
    });
  });

  it("returns undefined provenance when not provided", async () => {
    const input: EmitEventInput = {
      type: EVENT_TYPE.CLIENT_CREATED,
      userId: "user_1",
      source: "app" as EventSource,
      payload: { name: "Test" },
    };

    const result = await emitEvent(persister, input);

    expect(result.provenance).toBeUndefined();
  });
});
