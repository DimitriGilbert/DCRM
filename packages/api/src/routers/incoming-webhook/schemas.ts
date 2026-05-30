import { z } from "zod";
import { incomingWebhookModeSchema } from "@DCRM/domain";

const COERCE_VALUES = ["string", "number", "boolean"] as const;

const coerceSchema = z.enum(COERCE_VALUES).optional();

export const createIncomingWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  secret: z.string().min(8).max(256).optional(),
  mappingConfig: z.object({
    eventType: z.string().min(1),
    fields: z.array(z.object({
      sourcePath: z.string().min(1),
      targetField: z.string().min(1),
      defaultValue: z.unknown().optional(),
      coerce: coerceSchema,
    })),
    staticPayload: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  enabled: z.boolean().optional().default(true),
});

export const updateIncomingWebhookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  secret: z.string().min(8).max(256).nullable().optional(),
  mode: incomingWebhookModeSchema.optional(),
  mappingConfig: z.object({
    eventType: z.string().min(1),
    fields: z.array(z.object({
      sourcePath: z.string().min(1),
      targetField: z.string().min(1),
      defaultValue: z.unknown().optional(),
      coerce: coerceSchema,
    })),
    staticPayload: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  enabled: z.boolean().optional(),
});

export const deleteIncomingWebhookSchema = z.object({
  id: z.string().min(1),
});

export const testMappingSchema = z.object({
  id: z.string().min(1),
  samplePayload: z.record(z.string(), z.unknown()),
});
