import { z } from "zod";
import { aiProviderSchema } from "@DCRM/domain";

export const createAIProviderSchema = z.object({
  provider: aiProviderSchema,
  name: z.string().min(1).max(100),
  apiKey: z.string().min(1),
  baseUrl: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const updateAIProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().min(1).nullable().optional(),
  defaultModel: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const deleteAIProviderSchema = z.object({
  id: z.string().min(1),
});
