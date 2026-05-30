import { db } from "@DCRM/db";
import { exchanges } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { exchangeIdSchema } from "./schemas";

export const readExchange = protectedProcedure
  .input(exchangeIdSchema)
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select()
      .from(exchanges)
      .where(
        and(
          eq(exchanges.id, input.id),
          eq(exchanges.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return row;
  });
