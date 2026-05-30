import { db } from "@DCRM/db";
import { aiInsights } from "@DCRM/db/schema/automation";
import { eq, and, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listInsightsSchema } from "./schemas";

export const listInsights = protectedProcedure
  .input(listInsightsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(aiInsights.userId, ctx.user.id)];

    if (input.entityType !== undefined) {
      conditions.push(eq(aiInsights.entityType, input.entityType));
    }
    if (input.entityId !== undefined) {
      conditions.push(eq(aiInsights.entityId, input.entityId));
    }
    if (input.applied !== undefined) {
      conditions.push(eq(aiInsights.applied, input.applied));
    }

    const rows = await db
      .select({
        id: aiInsights.id,
        hookExecutionId: aiInsights.hookExecutionId,
        entityType: aiInsights.entityType,
        entityId: aiInsights.entityId,
        provider: aiInsights.provider,
        model: aiInsights.model,
        prompt: aiInsights.prompt,
        structuredOutput: aiInsights.structuredOutput,
        fieldMappingResult: aiInsights.fieldMappingResult,
        applied: aiInsights.applied,
        createdAt: aiInsights.createdAt,
      })
      .from(aiInsights)
      .where(and(...conditions))
      .orderBy(desc(aiInsights.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return rows;
  });
