import { db } from "@DCRM/db";
import { userSettings } from "@DCRM/db/schema/crm";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { completeOnboardingSchema } from "./schemas";

export const completeOnboarding = protectedProcedure
  .input(completeOnboardingSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select({ userId: userSettings.userId })
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userSettings)
        .set({
          onboardingCompleted: true,
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.theme ? { theme: input.theme } : {}),
        })
        .where(eq(userSettings.userId, ctx.user.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(userSettings)
      .values({
        userId: ctx.user.id,
        onboardingCompleted: true,
        locale: input.locale ?? "en",
        theme: input.theme ?? "system",
      })
      .returning();
    return created;
  });
