import { db } from "@DCRM/db";
import { userSettings } from "@DCRM/db/schema/crm";

import { protectedProcedure } from "../../index";
import { updateThemeSchema } from "./schemas";

export const updateTheme = protectedProcedure
  .input(updateThemeSchema)
  .mutation(async ({ ctx, input }) => {
    const [result] = await db
      .insert(userSettings)
      .values({
        userId: ctx.user.id,
        theme: input.theme,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { theme: input.theme },
      })
      .returning();
    return result;
  });
