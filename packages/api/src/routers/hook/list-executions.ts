import { db } from "@DCRM/db";
import { hookExecutions } from "@DCRM/db/schema/automation";
import { eq, and, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listExecutionsSchema } from "./schemas";

export const listExecutions = protectedProcedure
  .input(listExecutionsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(hookExecutions.userId, ctx.user.id)];

    if (input.hookId !== undefined) {
      conditions.push(eq(hookExecutions.hookId, input.hookId));
    }
    if (input.status !== undefined) {
      conditions.push(eq(hookExecutions.status, input.status));
    }

    const rows = await db
      .select({
        id: hookExecutions.id,
        hookId: hookExecutions.hookId,
        eventId: hookExecutions.eventId,
        status: hookExecutions.status,
        input: hookExecutions.input,
        output: hookExecutions.output,
        error: hookExecutions.error,
        retryCount: hookExecutions.retryCount,
        maxRetries: hookExecutions.maxRetries,
        startedAt: hookExecutions.startedAt,
        completedAt: hookExecutions.completedAt,
        createdAt: hookExecutions.createdAt,
      })
      .from(hookExecutions)
      .where(and(...conditions))
      .orderBy(desc(hookExecutions.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return rows;
  });
