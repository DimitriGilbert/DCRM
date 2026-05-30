import { db } from "@DCRM/db";
import { tickets } from "@DCRM/db/schema/crm";
import { eq, and, isNull, or, ilike, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { searchTicketsSchema } from "./schemas";

export const searchTickets = protectedProcedure
  .input(searchTicketsSchema)
  .query(async ({ ctx, input }) => {
    const pattern = `%${input.query}%`;

    const rows = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.userId, ctx.user.id),
          isNull(tickets.deletedAt),
          or(
            ilike(tickets.title, pattern),
            ilike(tickets.description, pattern),
          ),
        ),
      )
      .orderBy(desc(tickets.createdAt))
      .limit(input.limit);

    return rows;
  });
