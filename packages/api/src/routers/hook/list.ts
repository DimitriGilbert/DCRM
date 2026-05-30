import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const listHooks = protectedProcedure.query(async ({ ctx }) => {
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
    .where(eq(hooks.userId, ctx.user.id));

  return rows;
});
