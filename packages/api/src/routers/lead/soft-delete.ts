import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { leadIdSchema } from "./schemas";

export const softDeleteLead = protectedProcedure
  .input(leadIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.id, input.id),
          eq(leads.userId, ctx.user.id),
          isNull(leads.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const now = new Date();
    const [updated] = await db
      .update(leads)
      .set({ deletedAt: now })
      .where(eq(leads.id, input.id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.LEAD_DELETED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "lead", id: input.id },
        payload: { deletedAt: now.toISOString() },
      },
    );

    return updated ?? null;
  });
