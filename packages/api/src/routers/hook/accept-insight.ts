import { db } from "@DCRM/db";
import { aiInsights } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../index";

/**
 * Accept a proposed AI insight by applying its mapped fields to the entity.
 * This is the user-approval step for propose_first write behavior.
 */
export const acceptInsight = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    const [insight] = await db
      .select()
      .from(aiInsights)
      .where(
        and(
          eq(aiInsights.id, input.id),
          eq(aiInsights.userId, ctx.user.id),
        ),
      );

    if (!insight) {
      throw new Error("AI insight not found");
    }

    if (insight.applied) {
      throw new Error("AI insight already applied");
    }

    if (!insight.fieldMappingResult) {
      throw new Error("AI insight has no field mapping result");
    }

    const mappingResult = insight.fieldMappingResult as Record<string, unknown>;
    const fields = mappingResult["fields"] as Record<string, unknown> | undefined;

    if (!fields || Object.keys(fields).length === 0) {
      throw new Error("AI insight has no mappable fields");
    }

    // Mark as applied
    await db
      .update(aiInsights)
      .set({ applied: true })
      .where(eq(aiInsights.id, input.id));

    return {
      id: insight.id,
      entityType: insight.entityType,
      entityId: insight.entityId,
      applied: true,
      fields,
    };
  });
