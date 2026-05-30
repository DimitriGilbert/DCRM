import { db } from "@DCRM/db";
import { userSettings } from "@DCRM/db/schema/crm";

import { protectedProcedure } from "../../index";
import { updateLocaleSchema } from "./schemas";

export const updateLocale = protectedProcedure
  .input(updateLocaleSchema)
  .mutation(async ({ ctx, input }) => {
    const [result] = await db
      .insert(userSettings)
      .values({
        userId: ctx.user.id,
        locale: input.locale,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { locale: input.locale },
      })
      .returning();
    return result;
  });
