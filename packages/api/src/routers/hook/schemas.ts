import { z } from "zod";
import { hookTypeSchema, hookWriteBehaviorSchema } from "@DCRM/domain";

export const createHookSchema = z.object({
  name: z.string().min(1).max(200),
  type: hookTypeSchema,
  eventType: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  config: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  fieldMapping: z.record(z.string(), z.string()).optional(),
  writeBehavior: hookWriteBehaviorSchema.optional().default("propose_first"),
  emitDownstreamEvents: z.boolean().optional().default(false),
});

export const updateHookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  eventType: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).nullable().optional(),
  fieldMapping: z.record(z.string(), z.string()).nullable().optional(),
  writeBehavior: hookWriteBehaviorSchema.optional(),
  emitDownstreamEvents: z.boolean().optional(),
});

export const deleteHookSchema = z.object({
  id: z.string().min(1),
});

export const listHooksSchema = z.object({
  eventType: z.string().min(1).optional(),
  type: hookTypeSchema.optional(),
  enabled: z.boolean().optional(),
});

export const listExecutionsSchema = z.object({
  hookId: z.string().min(1).optional(),
  status: z.enum(["pending", "running", "success", "failed"]).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const listInsightsSchema = z.object({
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  applied: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});
