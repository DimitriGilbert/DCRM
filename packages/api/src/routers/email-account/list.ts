import { db } from "@DCRM/db";
import { emailAccounts } from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const listEmailAccounts = protectedProcedure.query(async ({ ctx }) => {
  const rows = await db
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
    .where(eq(emailAccounts.userId, ctx.user.id));

  return rows;
});
