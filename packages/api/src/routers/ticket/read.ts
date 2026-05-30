import { db } from "@DCRM/db";
import { tickets } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { ticketIdSchema } from "./schemas";

export const readTicket = protectedProcedure
  .input(ticketIdSchema)
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.id, input.id),
          eq(tickets.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return row;
  });
