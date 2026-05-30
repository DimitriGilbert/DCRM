import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listHooksSchema } from "./schemas";

export const listHooks = protectedProcedure
  .input(listHooksSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(hooks.userId, ctx.user.id)];

    if (input.eventType !== undefined) {
      conditions.push(eq(hooks.eventType, input.eventType));
    }
    if (input.type !== undefined) {
      conditions.push(eq(hooks.type, input.type));
    }
    if (input.enabled !== undefined) {
      conditions.push(eq(hooks.enabled, input.enabled));
    }

    const rows = await db
      .select({
        id: hooks.id,
        name: hooks.name,
        type: hooks.type,
        eventType: hooks.eventType,
        enabled: hooks.enabled,
        config: hooks.config,
        outputSchema: hooks.outputSchema,
        fieldMapping: hooks.fieldMapping,
        writeBehavior: hooks.writeBehavior,
        emitDownstreamEvents: hooks.emitDownstreamEvents,
        createdAt: hooks.createdAt,
        updatedAt: hooks.updatedAt,
      })
      .from(hooks)
      .where(and(...conditions));

    return rows;
  });
