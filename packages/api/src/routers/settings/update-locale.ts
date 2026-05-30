import { db } from "@DCRM/db";
import { userSettings } from "@DCRM/db/schema/crm";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateLocaleSchema } from "./schemas";

export const updateLocale = protectedProcedure
  .input(updateLocaleSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select({ userId: userSettings.userId })
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userSettings)
        .set({ locale: input.locale })
        .where(eq(userSettings.userId, ctx.user.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(userSettings)
      .values({
        userId: ctx.user.id,
        locale: input.locale,
      })
      .returning();
    return created;
  });
