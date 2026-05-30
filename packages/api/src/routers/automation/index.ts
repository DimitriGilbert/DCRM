import { AI_HOOK_TEMPLATES } from "@DCRM/domain";
import { isCoreEventType } from "@DCRM/events";
import { z } from "zod";

import { protectedProcedure, router } from "../../index.js";
import { listFailedHookExecutions } from "./listFailedHookExecutions.js";

import type { AutomationRepository } from "../../automation/repository.js";

const aiHookOutputFieldSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["string", "number", "boolean", "string_array"]),
  required: z.boolean().default(false),
});

const aiHookFieldMappingSchema = z.object({
  sourcePath: z.string().trim().min(1),
  targetField: z.string().trim().min(1),
});

const createAiHookInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  eventType: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
  providerId: z.string().trim().min(1),
  model: z.string().trim().min(1).max(160),
  template: z.enum(AI_HOOK_TEMPLATES),
  prompt: z.string().trim().min(1).max(4_000).optional().or(z.literal("")),
  outputFields: z.array(aiHookOutputFieldSchema).min(1),
  fieldMappings: z.array(aiHookFieldMappingSchema).default([]),
  writeBehavior: z.enum(["propose", "direct"]),
  downstreamEventBehavior: z.enum(["suppress", "emit"]).default("suppress"),
});

export const automationRouter = router({
  listFailedHookExecutions,
  listAiHooks: protectedProcedure.query(async ({ ctx }) => {
    return requireAutomationRepository(ctx.automationRepository).hooks.listAiHooks({ userId: ctx.auth.user.id });
  }),
  createAiHook: protectedProcedure.input(createAiHookInputSchema).mutation(async ({ ctx, input }) => {
    return requireAutomationRepository(ctx.automationRepository).hooks.createAiHook({
      id: crypto.randomUUID(),
      userId: ctx.auth.user.id,
      name: input.name.trim(),
      eventType: parseCoreEventType(input.eventType),
      enabled: input.enabled,
      providerId: input.providerId,
      model: input.model.trim(),
      template: input.template,
      ...(input.prompt ? { prompt: input.prompt.trim() } : {}),
      outputFields: input.outputFields,
      fieldMappings: input.fieldMappings,
      writeBehavior: input.writeBehavior,
      downstreamEventBehavior: input.downstreamEventBehavior,
      now: new Date(),
    });
  }),
});

function requireAutomationRepository(automationRepository: AutomationRepository | undefined): AutomationRepository {
  if (!automationRepository) {
    throw new Error("Automation repository is required for hook configuration.");
  }
  return automationRepository;
}

function parseCoreEventType(value: string) {
  const eventType = value.trim();
  if (!isCoreEventType(eventType)) {
    throw new Error(`Unsupported AI hook event type: ${eventType}`);
  }
  return eventType;
}
