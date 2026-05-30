import { createDb } from "@DCRM/db";
import { events, hookExecutions, hooks } from "@DCRM/db/schema/automation-integrations";
import { and, desc, eq } from "drizzle-orm";

import type { AutomationRepository, HookExecutionStatusRecord } from "./repository.js";

type AutomationDatabase = ReturnType<typeof createDb>;

export function createDrizzleAutomationRepository(database: AutomationDatabase = createDb()): AutomationRepository {
  return {
    hookExecutions: {
      async listFailures(input) {
        const rows = await database
          .select({
            id: hookExecutions.id,
            userId: hookExecutions.userId,
            hookId: hookExecutions.hookId,
            hookName: hooks.name,
            eventId: hookExecutions.eventId,
            eventType: events.type,
            status: hookExecutions.status,
            error: hookExecutions.error,
            attempt: hookExecutions.attempt,
            maxAttempts: hookExecutions.maxAttempts,
            queuedAt: hookExecutions.queuedAt,
            startedAt: hookExecutions.startedAt,
            finishedAt: hookExecutions.finishedAt,
            nextRetryAt: hookExecutions.nextRetryAt,
            createdAt: hookExecutions.createdAt,
          })
          .from(hookExecutions)
          .innerJoin(hooks, eq(hookExecutions.hookId, hooks.id))
          .innerJoin(events, eq(hookExecutions.eventId, events.id))
          .where(and(eq(hookExecutions.userId, input.userId), eq(hookExecutions.status, "failed")))
          .orderBy(desc(hookExecutions.createdAt))
          .limit(input.limit ?? 10);

        return rows.map((row): HookExecutionStatusRecord => ({
          id: row.id,
          userId: row.userId,
          hookId: row.hookId,
          hookName: row.hookName,
          eventId: row.eventId,
          eventType: row.eventType,
          status: row.status,
          error: row.error,
          attempt: row.attempt,
          maxAttempts: row.maxAttempts,
          queuedAt: row.queuedAt,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          nextRetryAt: row.nextRetryAt,
          createdAt: row.createdAt,
        }));
      },
    },
  };
}
