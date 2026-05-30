import { createDb } from "@DCRM/db";
import { hookExecutions, hooks } from "@DCRM/db/schema/automation-integrations";
import { and, desc, eq, isNull } from "drizzle-orm";

import { isCoreEventType } from "./index.js";

import type { CoreEventType, JsonObject } from "./index.js";
import type {
  CreateHookExecutionInput,
  HookExecutionRecord,
  HookExecutionRepository,
  HookRepository,
  HookSubscription,
} from "./hooks.js";

type HookDatabase = ReturnType<typeof createDb>;
type HookRow = typeof hooks.$inferSelect;
type HookExecutionRow = typeof hookExecutions.$inferSelect;

/** Creates the production hook subscription resolver backed by the Drizzle hooks table. */
export function createDrizzleHookRepository(database: HookDatabase = createDb()): HookRepository {
  return {
    async listEnabledForEvent(input) {
      const rows = await database
        .select()
        .from(hooks)
        .where(and(eq(hooks.userId, input.userId), eq(hooks.eventType, input.eventType), eq(hooks.enabled, true), isNull(hooks.deletedAt)))
        .orderBy(desc(hooks.createdAt));
      return rows.map(rowToHookSubscription);
    },
    async getById(hookId) {
      const rows = await database.select().from(hooks).where(and(eq(hooks.id, hookId), isNull(hooks.deletedAt))).limit(1);
      const row = rows[0];
      return row ? rowToHookSubscription(row) : undefined;
    },
  };
}

/** Creates the production hook execution lifecycle repository backed by Drizzle. */
export function createDrizzleHookExecutionRepository(database: HookDatabase = createDb()): HookExecutionRepository {
  return {
    async createPending(input) {
      const rows = await database
        .insert(hookExecutions)
        .values({
          id: input.id,
          userId: input.event.userId,
          hookId: input.hook.id,
          eventId: input.event.id,
          status: "pending",
          input: eventInputToJsonObject(input),
          attempt: 0,
          maxAttempts: input.retryPolicy.maxAttempts,
          retryMetadata: retryPolicyToJsonObject(input.retryPolicy),
          queuedAt: input.queuedAt,
          createdAt: input.queuedAt,
          updatedAt: input.queuedAt,
        })
        .returning();
      return requireHookExecutionRow(rows[0], input.id);
    },
    async markRunning(input) {
      const rows = await database
        .update(hookExecutions)
        .set({ status: "running", startedAt: input.startedAt, attempt: input.attempt, updatedAt: input.startedAt })
        .where(eq(hookExecutions.id, input.executionId))
        .returning();
      return requireHookExecutionRow(rows[0], input.executionId);
    },
    async markSuccess(input) {
      const rows = await database
        .update(hookExecutions)
        .set({ status: "success", output: input.output, error: null, finishedAt: input.finishedAt, nextRetryAt: null, updatedAt: input.finishedAt })
        .where(eq(hookExecutions.id, input.executionId))
        .returning();
      return requireHookExecutionRow(rows[0], input.executionId);
    },
    async markFailed(input) {
      const rows = await database
        .update(hookExecutions)
        .set({
          status: "failed",
          error: input.error,
          finishedAt: input.finishedAt,
          nextRetryAt: input.nextRetryAt ?? null,
          updatedAt: input.finishedAt,
        })
        .where(eq(hookExecutions.id, input.executionId))
        .returning();
      return requireHookExecutionRow(rows[0], input.executionId);
    },
    async getById(executionId) {
      const rows = await database.select().from(hookExecutions).where(eq(hookExecutions.id, executionId)).limit(1);
      const row = rows[0];
      return row ? rowToHookExecution(row) : undefined;
    },
    async listForEvent(eventId) {
      const rows = await database.select().from(hookExecutions).where(eq(hookExecutions.eventId, eventId)).orderBy(desc(hookExecutions.createdAt));
      return rows.map(rowToHookExecution);
    },
  };
}

function rowToHookSubscription(row: HookRow): HookSubscription {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    eventType: parseCoreEventType(row.eventType),
    type: row.type,
    enabled: row.enabled,
    config: row.config,
  };
}

function rowToHookExecution(row: HookExecutionRow): HookExecutionRecord {
  return {
    id: row.id,
    userId: row.userId,
    hookId: row.hookId,
    eventId: row.eventId,
    status: row.status,
    input: row.input,
    ...(row.output ? { output: row.output } : {}),
    ...(row.error ? { error: row.error } : {}),
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    retryMetadata: row.retryMetadata,
    queuedAt: row.queuedAt,
    ...(row.startedAt ? { startedAt: row.startedAt } : {}),
    ...(row.finishedAt ? { finishedAt: row.finishedAt } : {}),
    ...(row.nextRetryAt ? { nextRetryAt: row.nextRetryAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireHookExecutionRow(row: HookExecutionRow | undefined, executionId: string): HookExecutionRecord {
  if (!row) {
    throw new Error(`Hook execution could not be persisted: ${executionId}`);
  }
  return rowToHookExecution(row);
}

function parseCoreEventType(value: string): CoreEventType {
  if (isCoreEventType(value)) {
    return value;
  }
  throw new Error(`Unknown hook event type: ${value}`);
}

function eventInputToJsonObject(input: CreateHookExecutionInput): JsonObject {
  return {
    event: {
      id: input.event.id,
      type: input.event.type,
      userId: input.event.userId,
      source: input.event.source,
      ...(input.event.entity ? { entity: input.event.entity } : {}),
      payload: input.event.payload,
      ...(input.event.changes ? { changes: input.event.changes } : {}),
      metadata: input.event.metadata,
      createdAt: input.event.createdAt.toISOString(),
    },
  };
}

function retryPolicyToJsonObject(retryPolicy: CreateHookExecutionInput["retryPolicy"]): JsonObject {
  return {
    backoffType: retryPolicy.backoff.type,
    backoffDelayMs: retryPolicy.backoff.delayMs,
  };
}
