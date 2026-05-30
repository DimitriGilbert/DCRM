import { randomUUID } from "node:crypto";

import type { DcrmEvent } from "./emitter";
import {
  resolveHooks,
  type HookQueryFn,
  type HookRecord,
} from "./hook-resolver";
import { shouldDispatchHooksForEvent } from "./provenance";
import type { HookJobData, QueueAdapter } from "./queue";
import { shouldRetry, type RetryPolicy } from "./retry";

// --- Execution lifecycle types ---

export type HookExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "failed";

export type ExecutionRecord = {
  readonly id: string;
  readonly userId: string;
  readonly hookId: string;
  readonly eventId: string;
  readonly status: HookExecutionStatus;
  readonly input: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly error?: string;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
};

export type ExecutionStore = {
  readonly insert: (record: ExecutionRecord) => Promise<void>;
  readonly updateStatus: (
    id: string,
    status: HookExecutionStatus,
    details?: {
      output?: Record<string, unknown>;
      error?: string;
      retryCount?: number;
    },
  ) => Promise<void>;
};

// --- Hook handler types ---

export type HookHandler = {
  readonly execute: (
    hook: HookRecord,
    event: DcrmEvent,
  ) => Promise<Record<string, unknown>>;
};

export type HookHandlerRegistry = {
  readonly get: (hookType: string) => HookHandler | undefined;
};

// --- Process result ---

export type ProcessJobResult =
  | { readonly status: "success" }
  | {
      readonly status: "failed";
      readonly shouldRetry: boolean;
      readonly error: string;
    };

// --- Dispatch ---

/**
 * Resolves matching hooks for an event, creates pending execution records,
 * and enqueues independent jobs for each hook.
 *
 * Fire-all semantics: every matching hook is dispatched independently.
 * A later failure in one job cannot block siblings because they are
 * separate queue jobs.
 */
export async function dispatchHooks(
  event: DcrmEvent,
  queryFn: HookQueryFn,
  store: ExecutionStore,
  queue: QueueAdapter,
): Promise<readonly ExecutionRecord[]> {
  if (!shouldDispatchHooksForEvent(event)) {
    return [];
  }

  const hooks = await resolveHooks(queryFn, event.type, event.userId);
  const records: ExecutionRecord[] = [];

  for (const hook of hooks) {
    const record = createPendingRecord(hook, event);
    await store.insert(record);
    records.push(record);

    const jobData: HookJobData = {
      hookId: hook.id,
      hookType: hook.type,
      eventId: event.id,
      userId: event.userId,
      executionId: record.id,
      config: hook.config,
      retryCount: 0,
      maxRetries: hook.maxRetries,
    };

    try {
      await queue.addJob(jobData);
    } catch (err) {
      const queueError = err instanceof Error ? err.message : String(err);
      await store.updateStatus(record.id, "failed", {
        error: `Queue dispatch failed: ${queueError}`,
      });
    }
  }

  return records;
}

// --- Process ---

/**
 * Processes a single hook execution job through the lifecycle:
 * pending → running → success | failed.
 *
 * Returns a discriminated result indicating success or failure,
 * and whether the job is eligible for retry.
 */
export async function processJob(
  jobData: HookJobData,
  store: ExecutionStore,
  handlers: HookHandlerRegistry,
  event: DcrmEvent,
): Promise<ProcessJobResult> {
  await store.updateStatus(jobData.executionId, "running");

  const handler = handlers.get(jobData.hookType);
  if (handler === undefined) {
    await store.updateStatus(jobData.executionId, "failed", {
      error: `No handler registered for hook type: ${jobData.hookType}`,
    });
    return {
      status: "failed",
      shouldRetry: false,
      error: `No handler registered for hook type: ${jobData.hookType}`,
    };
  }

  const hook: HookRecord = {
    id: jobData.hookId,
    userId: jobData.userId,
    name: "",
    type: jobData.hookType,
    eventType: event.type,
    enabled: true,
    config: jobData.config,
    maxRetries: jobData.maxRetries,
  };

  try {
    const output = await handler.execute(hook, event);
    await store.updateStatus(jobData.executionId, "success", { output });
    return { status: "success" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const policy: RetryPolicy = {
      maxRetries: jobData.maxRetries,
      retryCount: jobData.retryCount,
    };
    const canRetry = shouldRetry(policy);

    await store.updateStatus(jobData.executionId, "failed", {
      error: errorMessage,
      retryCount: jobData.retryCount + 1,
    });

    return {
      status: "failed",
      shouldRetry: canRetry,
      error: errorMessage,
    };
  }
}

// --- Helpers ---

function createPendingRecord(
  hook: HookRecord,
  event: DcrmEvent,
): ExecutionRecord {
  return {
    id: randomUUID(),
    userId: event.userId,
    hookId: hook.id,
    eventId: event.id,
    status: "pending",
    input: {
      eventId: event.id,
      eventType: event.type,
      hookConfig: hook.config,
      eventPayload: event.payload,
    },
    retryCount: 0,
    maxRetries: hook.maxRetries,
  };
}
