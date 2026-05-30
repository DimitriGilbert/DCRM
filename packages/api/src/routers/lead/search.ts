import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import { eq, and, isNull, or, ilike, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { searchLeadsSchema } from "./schemas";

export const searchLeads = protectedProcedure
  .input(searchLeadsSchema)
  .query(async ({ ctx, input }) => {
    const pattern = `%${input.query}%`;

    const rows = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.userId, ctx.user.id),
          isNull(leads.deletedAt),
          or(
            ilike(leads.name, pattern),
            ilike(leads.email, pattern),
            ilike(leads.company, pattern),
            ilike(leads.website, pattern),
            ilike(leads.source, pattern),
          ),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(input.limit);

    return rows;
  });
