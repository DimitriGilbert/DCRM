import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { leadIdSchema } from "./schemas";

export const readLead = protectedProcedure
  .input(leadIdSchema)
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.id, input.id),
          eq(leads.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return row;
  });
