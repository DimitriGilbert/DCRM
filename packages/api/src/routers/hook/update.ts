import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core/query-builders/update";

import { protectedProcedure } from "../../index";
import { updateHookSchema } from "./schemas";

export const updateHook = protectedProcedure
  .input(updateHookSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;

    const setValues: PgUpdateSetSource<typeof hooks> = { updatedAt: new Date() };

    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.eventType !== undefined) setValues.eventType = updates.eventType;
    if (updates.enabled !== undefined) setValues.enabled = updates.enabled;
    if (updates.config !== undefined) setValues.config = updates.config;
    if (updates.outputSchema !== undefined) setValues.outputSchema = updates.outputSchema;
    if (updates.fieldMapping !== undefined) setValues.fieldMapping = updates.fieldMapping;
    if (updates.writeBehavior !== undefined) setValues.writeBehavior = updates.writeBehavior;
    if (updates.emitDownstreamEvents !== undefined) setValues.emitDownstreamEvents = updates.emitDownstreamEvents;

    const result = await db
      .update(hooks)
      .set(setValues)
      .where(
        and(
          eq(hooks.id, id),
          eq(hooks.userId, ctx.user.id),
        ),
      )
      .returning({ id: hooks.id });

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Hook not found" });
    }

    return { id };
  });
