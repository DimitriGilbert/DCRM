import { z } from "zod";

export const updateLocaleSchema = z.object({
  locale: z.string().min(1).max(10),
});

export const updateThemeSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
});

export const completeOnboardingSchema = z.object({
  locale: z.string().min(1).max(10).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});
