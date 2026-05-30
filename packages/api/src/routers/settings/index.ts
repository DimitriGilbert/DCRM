import { USER_THEME_PREFERENCES } from "@DCRM/domain";
import { resolveLocale } from "@DCRM/i18n";
import { z } from "zod";

import { protectedProcedure, router } from "../../index.js";

import type { CrmRepository } from "../../crm/repository.js";

const updateLocaleInput = z.object({
  locale: z.string().transform((value) => resolveLocale(value)),
});

const updatePreferencesInput = z.object({
  locale: z.string().transform((value) => resolveLocale(value)),
  theme: z.enum(USER_THEME_PREFERENCES),
});

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return getOrCreateUserSettings(ctx.crmRepository, ctx.auth.user.id);
  }),
  updateLocale: protectedProcedure.input(updateLocaleInput).mutation(async ({ ctx, input }) => {
    return ctx.crmRepository.userSettings.upsert({
      id: crypto.randomUUID(),
      userId: ctx.auth.user.id,
      fields: { locale: input.locale },
      now: new Date(),
    });
  }),
  updatePreferences: protectedProcedure.input(updatePreferencesInput).mutation(async ({ ctx, input }) => {
    return ctx.crmRepository.userSettings.upsert({
      id: crypto.randomUUID(),
      userId: ctx.auth.user.id,
      fields: { locale: input.locale, theme: input.theme },
      now: new Date(),
    });
  }),
  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.crmRepository.userSettings.upsert({
      id: crypto.randomUUID(),
      userId: ctx.auth.user.id,
      fields: { onboardingCompleted: true },
      now: new Date(),
    });
  }),
});

async function getOrCreateUserSettings(repository: CrmRepository, userId: string) {
  const existing = await repository.userSettings.getByUserId({ userId });
  if (existing) {
    return existing;
  }
  return repository.userSettings.upsert({ id: crypto.randomUUID(), userId, fields: { locale: "en", theme: "system", onboardingCompleted: false }, now: new Date() });
}
