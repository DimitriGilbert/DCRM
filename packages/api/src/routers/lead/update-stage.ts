import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateLeadStageSchema } from "./schemas";

export const updateLeadStage = protectedProcedure
  .input(updateLeadStageSchema)
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

    const [updated] = await db
      .update(leads)
      .set({ stage: input.stage })
      .where(eq(leads.id, input.id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.LEAD_STAGE_CHANGED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "lead", id: input.id },
        payload: { stage: input.stage },
        changes: {
          before: { stage: existing.stage },
          after: { stage: input.stage },
        },
      },
    );

    return updated ?? null;
  });
