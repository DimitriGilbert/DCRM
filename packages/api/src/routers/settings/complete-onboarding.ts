import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { userSettings } from "@DCRM/db/schema/crm";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { completeOnboardingSchema } from "./schemas";

export const completeOnboarding = protectedProcedure
  .input(completeOnboardingSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select({ onboardingCompleted: userSettings.onboardingCompleted })
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id))
      .limit(1);

    if (existing?.onboardingCompleted) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Onboarding already completed",
      });
    }

    const [result] = await db
      .insert(userSettings)
      .values({
        userId: ctx.user.id,
        onboardingCompleted: true,
        locale: input.locale ?? "en",
        theme: input.theme ?? "system",
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          onboardingCompleted: true,
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.theme ? { theme: input.theme } : {}),
        },
      })
      .returning();
    return result;
  });
