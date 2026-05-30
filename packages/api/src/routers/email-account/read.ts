import { db } from "@DCRM/db";
import { emailAccounts } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { emailAccountIdSchema } from "./schemas";

export const readEmailAccount = protectedProcedure
  .input(emailAccountIdSchema)
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select({
        id: emailAccounts.id,
        email: emailAccounts.email,
        syncEnabled: emailAccounts.syncEnabled,
        syncInterval: emailAccounts.syncInterval,
        lastSyncAt: emailAccounts.lastSyncAt,
        createdAt: emailAccounts.createdAt,
        updatedAt: emailAccounts.updatedAt,
      })
      .from(emailAccounts)
      .where(
        and(
          eq(emailAccounts.id, input.id),
          eq(emailAccounts.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return row;
  });
