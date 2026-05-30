import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../index";

export const getHook = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    const [row] = await db
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
      .where(
        and(
          eq(hooks.id, input.id),
          eq(hooks.userId, ctx.user.id),
        ),
      );

    return row ?? null;
  });
