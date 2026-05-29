import { describe, it, expect, vi } from "vitest";

import type { DcrmEvent } from "../src/emitter";
import { EVENT_TYPE } from "../src/event-types";
import {
  dispatchHooks,
  processJob,
  type ExecutionRecord,
  type ExecutionStore,
  type HookHandlerRegistry,
} from "../src/executor";
import type { HookQueryFn, HookRecord } from "../src/hook-resolver";
import type { HookJobData, QueueAdapter } from "../src/queue";
import { shouldRetry, getRetryDelayMs } from "../src/retry";

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

function makeHook(overrides: Partial<HookRecord> & { id: string }): HookRecord {
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
          details?: { output?: Record<string, unknown>; error?: string },
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

// --- Tests ---

describe("dispatchHooks — fire-all dispatching", () => {
  const event = makeEvent();

  it("dispatches all matching enabled hooks", async () => {
    const hooks = [
      makeHook({ id: "h1", type: "ai" }),
      makeHook({ id: "h2", type: "outgoing_webhook" }),
    ];

    const queryFn: HookQueryFn = vi.fn().mockResolvedValue(hooks);
    const { records, store } = createStore();
    const { jobs, queue } = createSpyQueue();

    const result = await dispatchHooks(event, queryFn, store, queue);

    expect(result).toHaveLength(2);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].hookId).toBe("h1");
    expect(jobs[1].hookId).toBe("h2");
    expect(result[0].status).toBe("pending");
    expect(result[1].status).toBe("pending");
  });

  it("filters out disabled hooks", async () => {
    const hooks = [
      makeHook({ id: "h1", enabled: true }),
      makeHook({ id: "h2", enabled: false }),
    ];

    const queryFn: HookQueryFn = vi.fn().mockResolvedValue(hooks);
    const { store } = createStore();
    const { jobs, queue } = createSpyQueue();

    const result = await dispatchHooks(event, queryFn, store, queue);

    expect(result).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    expect(result[0].hookId).toBe("h1");
  });

  it("returns empty array when no hooks match", async () => {
    const queryFn: HookQueryFn = vi.fn().mockResolvedValue([]);
    const { store } = createStore();
    const { jobs, queue } = createSpyQueue();

    const result = await dispatchHooks(event, queryFn, store, queue);

    expect(result).toHaveLength(0);
    expect(jobs).toHaveLength(0);
  });

  it("creates execution records with correct input context", async () => {
    const hooks = [makeHook({ id: "h1", config: { prompt: "summarize" } })];
    const queryFn: HookQueryFn = vi.fn().mockResolvedValue(hooks);
    const { records, store } = createStore();
    const { queue } = createSpyQueue();

    const result = await dispatchHooks(event, queryFn, store, queue);

    expect(result).toHaveLength(1);
    const input = result[0].input;
    expect(input.eventId).toBe("evt_1");
    expect(input.eventType).toBe(EVENT_TYPE.CLIENT_CREATED);
    expect(input.hookConfig).toEqual({ prompt: "summarize" });
    expect(input.eventPayload).toEqual({ name: "Acme" });
  });
});

describe("processJob — lifecycle and failure isolation", () => {
  const event = makeEvent();

  it("transitions to success on handler success", async () => {
    const handler = {
      execute: vi.fn().mockResolvedValue({ result: "ok" }),
    };
    const handlers: HookHandlerRegistry = {
      get: vi.fn().mockReturnValue(handler),
    };
    const { records, store } = createStore();

    const execId = "exec_1";
    records.set(execId, {
      id: execId,
      userId: "user_1",
      hookId: "h1",
      eventId: "evt_1",
      status: "pending",
      input: {},
      retryCount: 0,
      maxRetries: 3,
    });

    const jobData: HookJobData = {
      hookId: "h1",
      hookType: "ai",
      eventId: "evt_1",
      userId: "user_1",
      executionId: execId,
      config: {},
      retryCount: 0,
      maxRetries: 3,
    };

    const result = await processJob(jobData, store, handlers, event);

    expect(result.status).toBe("success");
    expect(records.get(execId)?.status).toBe("success");
    expect(records.get(execId)?.output).toEqual({ result: "ok" });
  });

  it("transitions to failed with retry when retries remain", async () => {
    const handler = {
      execute: vi.fn().mockRejectedValue(new Error("API timeout")),
    };
    const handlers: HookHandlerRegistry = {
      get: vi.fn().mockReturnValue(handler),
    };
    const { records, store } = createStore();

    const execId = "exec_2";
    records.set(execId, {
      id: execId,
      userId: "user_1",
      hookId: "h2",
      eventId: "evt_1",
      status: "pending",
      input: {},
      retryCount: 0,
      maxRetries: 3,
    });

    const jobData: HookJobData = {
      hookId: "h2",
      hookType: "outgoing_webhook",
      eventId: "evt_1",
      userId: "user_1",
      executionId: execId,
      config: {},
      retryCount: 0,
      maxRetries: 3,
    };

    const result = await processJob(jobData, store, handlers, event);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.shouldRetry).toBe(true);
      expect(result.error).toBe("API timeout");
    }
    expect(records.get(execId)?.status).toBe("failed");
    expect(records.get(execId)?.error).toBe("API timeout");
  });

  it("reports no retry when max retries exhausted", async () => {
    const handler = {
      execute: vi.fn().mockRejectedValue(new Error("Still failing")),
    };
    const handlers: HookHandlerRegistry = {
      get: vi.fn().mockReturnValue(handler),
    };
    const { records, store } = createStore();

    const execId = "exec_3";
    records.set(execId, {
      id: execId,
      userId: "user_1",
      hookId: "h3",
      eventId: "evt_1",
      status: "pending",
      input: {},
      retryCount: 3,
      maxRetries: 3,
    });

    const jobData: HookJobData = {
      hookId: "h3",
      hookType: "ai",
      eventId: "evt_1",
      userId: "user_1",
      executionId: execId,
      config: {},
      retryCount: 3,
      maxRetries: 3,
    };

    const result = await processJob(jobData, store, handlers, event);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.shouldRetry).toBe(false);
    }
  });

  it("fails with no retry when no handler is registered", async () => {
    const handlers: HookHandlerRegistry = {
      get: vi.fn().mockReturnValue(undefined),
    };
    const { records, store } = createStore();

    const execId = "exec_4";
    records.set(execId, {
      id: execId,
      userId: "user_1",
      hookId: "h4",
      eventId: "evt_1",
      status: "pending",
      input: {},
      retryCount: 0,
      maxRetries: 3,
    });

    const jobData: HookJobData = {
      hookId: "h4",
      hookType: "unknown_type",
      eventId: "evt_1",
      userId: "user_1",
      executionId: execId,
      config: {},
      retryCount: 0,
      maxRetries: 3,
    };

    const result = await processJob(jobData, store, handlers, event);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.shouldRetry).toBe(false);
      expect(result.error).toContain("No handler registered");
    }
    expect(records.get(execId)?.status).toBe("failed");
  });

  it("fire-all: one hook failure does not block sibling hooks", async () => {
    const hooks = [
      makeHook({ id: "h1", type: "ai", maxRetries: 0 }),
      makeHook({ id: "h2", type: "outgoing_webhook", maxRetries: 0 }),
      makeHook({ id: "h3", type: "built_in", maxRetries: 0 }),
    ];

    const queryFn: HookQueryFn = vi.fn().mockResolvedValue(hooks);
    const { records, store } = createStore();
    const { jobs, queue } = createSpyQueue();

    // Dispatch all three hooks
    const dispatched = await dispatchHooks(event, queryFn, store, queue);
    expect(dispatched).toHaveLength(3);
    expect(jobs).toHaveLength(3);

    // Handlers: first fails, others succeed
    const failHandler = {
      execute: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const successHandler = {
      execute: vi.fn().mockResolvedValue({ ok: true }),
    };
    const successHandler2 = {
      execute: vi.fn().mockResolvedValue({ done: true }),
    };

    const handlers: HookHandlerRegistry = {
      get: (hookType: string) => {
        if (hookType === "ai") return failHandler;
        if (hookType === "outgoing_webhook") return successHandler;
        if (hookType === "built_in") return successHandler2;
        return undefined;
      },
    };

    // Process each job independently
    const r0 = await processJob(jobs[0], store, handlers, event);
    const r1 = await processJob(jobs[1], store, handlers, event);
    const r2 = await processJob(jobs[2], store, handlers, event);

    expect(r0.status).toBe("failed");
    expect(r1.status).toBe("success");
    expect(r2.status).toBe("success");

    // All three execution records have correct final statuses
    const statuses = dispatched.map(
      (rec) => records.get(rec.id)?.status,
    );
    expect(statuses).toEqual(["failed", "success", "success"]);
  });
});

describe("retry policy", () => {
  it("allows retry when attempts remain", () => {
    expect(shouldRetry({ maxRetries: 3, retryCount: 0 })).toBe(true);
    expect(shouldRetry({ maxRetries: 3, retryCount: 2 })).toBe(true);
  });

  it("denies retry when max reached", () => {
    expect(shouldRetry({ maxRetries: 3, retryCount: 3 })).toBe(false);
    expect(shouldRetry({ maxRetries: 0, retryCount: 0 })).toBe(false);
  });

  it("computes exponential backoff delays", () => {
    expect(getRetryDelayMs(0)).toBe(1000);
    expect(getRetryDelayMs(1)).toBe(2000);
    expect(getRetryDelayMs(2)).toBe(4000);
    expect(getRetryDelayMs(5)).toBe(32_000);
  });

  it("caps delay at 60 seconds", () => {
    expect(getRetryDelayMs(10)).toBe(60_000);
    expect(getRetryDelayMs(20)).toBe(60_000);
  });
});
