import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { clientIdSchema } from "./schemas";

export const readClient = protectedProcedure
  .input(clientIdSchema)
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, input.id),
          eq(clients.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return row;
  });
