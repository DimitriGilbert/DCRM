import { db } from "@DCRM/db";
import { emailAccounts } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { emailAccountIdSchema } from "./schemas";

export const deleteEmailAccount = protectedProcedure
  .input(emailAccountIdSchema)
  .mutation(async ({ ctx, input }) => {
    const result = await db
      .delete(emailAccounts)
      .where(
        and(
          eq(emailAccounts.id, input.id),
          eq(emailAccounts.userId, ctx.user.id),
        ),
      )
      .returning({ id: emailAccounts.id });

    return result[0] ?? null;
  });
