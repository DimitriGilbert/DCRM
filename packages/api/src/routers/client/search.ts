import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { eq, and, isNull, or, ilike, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { searchClientsSchema } from "./schemas";

export const searchClients = protectedProcedure
  .input(searchClientsSchema)
  .query(async ({ ctx, input }) => {
    const pattern = `%${input.query}%`;

    const rows = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.userId, ctx.user.id),
          isNull(clients.deletedAt),
          or(
            ilike(clients.name, pattern),
            ilike(clients.email, pattern),
            ilike(clients.company, pattern),
            ilike(clients.website, pattern),
          ),
        ),
      )
      .orderBy(desc(clients.createdAt))
      .limit(input.limit);

    return rows;
  });
