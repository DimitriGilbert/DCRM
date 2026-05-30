import { resolveLocale } from "@DCRM/i18n";
import { z } from "zod";

import { protectedProcedure, router } from "../../index.js";

import type { CrmRepository } from "../../crm/repository.js";

const updateLocaleInput = z.object({
  locale: z.string().transform((value) => resolveLocale(value)),
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
});

async function getOrCreateUserSettings(repository: CrmRepository, userId: string) {
  const existing = await repository.userSettings.getByUserId({ userId });
  if (existing) {
    return existing;
  }
  return repository.userSettings.upsert({ id: crypto.randomUUID(), userId, fields: { locale: "en" }, now: new Date() });
}
