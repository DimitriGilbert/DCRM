import { z } from "zod";

export const AI_PROVIDERS = {
  OPENROUTER: "openrouter",
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GOOGLE: "google",
} as const;

export type AIProviderKey = keyof typeof AI_PROVIDERS;

export type AIProvider = (typeof AI_PROVIDERS)[AIProviderKey];

export const AI_PROVIDER_VALUES: readonly AIProvider[] =
  Object.values(AI_PROVIDERS);

export const aiProviderSchema = z.enum([
  AI_PROVIDERS.OPENROUTER,
  AI_PROVIDERS.OPENAI,
  AI_PROVIDERS.ANTHROPIC,
  AI_PROVIDERS.GOOGLE,
]);
