import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateLeadSchema } from "./schemas";

export const updateLead = protectedProcedure
  .input(updateLeadSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;

    const [existing] = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.id, id),
          eq(leads.userId, ctx.user.id),
          isNull(leads.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    const [updated] = await db
      .update(leads)
      .set(updates)
      .where(eq(leads.id, id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.LEAD_UPDATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "lead", id },
        payload: updates,
        changes: {
          before: existing,
          after: updated,
        },
      },
    );

    return updated ?? null;
  });
