import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { aiInsights } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../index";

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
      throw new TRPCError({ code: "NOT_FOUND", message: "AI insight not found" });
    }

    if (insight.applied) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "AI insight already applied" });
    }

    if (!insight.fieldMappingResult) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "AI insight has no field mapping result" });
    }

    const mappingResult = insight.fieldMappingResult as Record<string, unknown>;
    const fields = mappingResult["fields"] as Record<string, unknown> | undefined;

    if (!fields || Object.keys(fields).length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "AI insight has no mappable fields" });
    }

    // Known gap: applied is set to true without actually writing the mapped fields
    // to the target entity. A future iteration must resolve the field values against
    // the entity (client, lead, etc.) and persist them before marking applied.
    await db
      .update(aiInsights)
      .set({ applied: true, fieldMappingResult: { ...mappingResult, fields, appliedAt: new Date().toISOString() } })
      .where(eq(aiInsights.id, input.id));

    return {
      id: insight.id,
      entityType: insight.entityType,
      entityId: insight.entityId,
      applied: true,
      fields,
    };
  });
