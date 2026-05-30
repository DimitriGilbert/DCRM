import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNotNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { leadIdSchema } from "./schemas";

export const restoreLead = protectedProcedure
  .input(leadIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.id, input.id),
          eq(leads.userId, ctx.user.id),
          isNotNull(leads.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const [updated] = await db
      .update(leads)
      .set({ deletedAt: null })
      .where(eq(leads.id, input.id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.LEAD_RESTORED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "lead", id: input.id },
        payload: {},
      },
    );

    return updated ?? null;
  });
