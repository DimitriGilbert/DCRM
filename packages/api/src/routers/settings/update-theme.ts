import { db } from "@DCRM/db";
import { userSettings } from "@DCRM/db/schema/crm";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateThemeSchema } from "./schemas";

export const updateTheme = protectedProcedure
  .input(updateThemeSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select({ userId: userSettings.userId })
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userSettings)
        .set({ theme: input.theme })
        .where(eq(userSettings.userId, ctx.user.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(userSettings)
      .values({
        userId: ctx.user.id,
        theme: input.theme,
      })
      .returning();
    return created;
  });
