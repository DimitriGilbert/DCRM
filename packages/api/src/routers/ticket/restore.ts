import { db } from "@DCRM/db";
import { tickets } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNotNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { ticketIdSchema } from "./schemas";

export const restoreTicket = protectedProcedure
  .input(ticketIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.id, input.id),
          eq(tickets.userId, ctx.user.id),
          isNotNull(tickets.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const [updated] = await db
      .update(tickets)
      .set({ deletedAt: null })
      .where(and(eq(tickets.id, input.id), eq(tickets.userId, ctx.user.id)))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.TICKET_RESTORED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "ticket", id: input.id },
        payload: {},
      },
    );

    return updated ?? null;
  });
