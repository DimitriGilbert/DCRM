import { db } from "@DCRM/db";
import { tickets } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { ticketIdSchema } from "./schemas";

export const softDeleteTicket = protectedProcedure
  .input(ticketIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.id, input.id),
          eq(tickets.userId, ctx.user.id),
          isNull(tickets.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const now = new Date();
    const [updated] = await db
      .update(tickets)
      .set({ deletedAt: now })
      .where(eq(tickets.id, input.id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.TICKET_DELETED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "ticket", id: input.id },
        payload: { deletedAt: now.toISOString() },
      },
    );

    return updated ?? null;
  });
