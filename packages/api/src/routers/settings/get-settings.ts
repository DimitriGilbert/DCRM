import { db } from "@DCRM/db";
import { userSettings } from "@DCRM/db/schema/crm";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const getSettings = protectedProcedure.query(async ({ ctx }) => {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, ctx.user.id))
    .limit(1);

  if (!row) {
    return null;
  }

  return row;
});
