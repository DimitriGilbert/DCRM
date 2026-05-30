import { AI_HOOK_TEMPLATES } from "@DCRM/domain";
import { isCoreEventType } from "@DCRM/events";
import { z } from "zod";

import type { SecretCrypto } from "@DCRM/crypto";

import { protectedProcedure, router } from "../../index.js";
import { mapIncomingWebhookPayload, normalizeIncomingWebhookCreate } from "../../automation/incoming-webhook.js";
import { parseSafeOutgoingWebhookUrl } from "../../automation/outgoing-webhook-url.js";
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

const retryPolicyInputSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  backoff: z.object({
    type: z.enum(["fixed", "exponential"]).default("exponential"),
    delayMs: z.number().int().min(0).max(86_400_000).default(1_000),
  }),
});

const customHeaderInputSchema = z.object({
  name: z.string().trim().min(1).max(128),
  value: z.string().trim().min(1).max(4_096),
});

const outgoingWebhookUrlInputSchema = z.url().superRefine((value, ctx) => {
  try {
    parseSafeOutgoingWebhookUrl(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Outgoing webhook URL is invalid.",
    });
  }
});

const outgoingWebhookAuthInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), token: z.string().trim().min(1).max(4_096) }),
  z.object({ type: z.literal("basic"), username: z.string().trim().min(1).max(256), password: z.string().trim().min(1).max(4_096) }),
  z.object({ type: z.literal("hmac"), secret: z.string().trim().min(1).max(4_096), headerName: z.string().trim().min(1).max(128).default("X-DCRM-Signature") }),
  z.object({ type: z.literal("custom_headers"), headers: z.array(customHeaderInputSchema).min(1).max(20) }),
]);

const createOutgoingWebhookHookInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  eventType: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
  url: outgoingWebhookUrlInputSchema,
  auth: outgoingWebhookAuthInputSchema,
  headers: z.record(z.string().trim().min(1).max(128), z.string().max(1_024)).default({}),
  retryPolicy: retryPolicyInputSchema.default({ maxAttempts: 3, backoff: { type: "exponential", delayMs: 1_000 } }),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

const incomingWebhookMappingSchema = z.object({
  mappings: z.array(z.object({ sourcePath: z.string().trim().min(1), targetPath: z.string().trim().min(1) })).default([]),
});

const createIncomingWebhookInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(3).max(120),
  token: z.string().trim().min(16).max(512).optional().or(z.literal("")),
  targetEventType: z.string().trim().min(1).max(160).default("webhook.webhook_received"),
  mappingConfig: incomingWebhookMappingSchema,
});

const previewIncomingWebhookInputSchema = z.object({
  mappingConfig: incomingWebhookMappingSchema,
  payload: jsonObjectSchema,
});

const updateIncomingWebhookModeInputSchema = z.object({
  id: z.string().trim().min(1),
  mode: z.enum(["test", "live"]),
});

export const automationRouter = router({
  listFailedHookExecutions,
  listAiHooks: protectedProcedure.query(async ({ ctx }) => {
    return requireAutomationRepository(ctx.automationRepository).hooks.listAiHooks({ userId: ctx.auth.user.id });
  }),
  listOutgoingWebhookHooks: protectedProcedure.query(async ({ ctx }) => {
    return requireAutomationRepository(ctx.automationRepository).hooks.listOutgoingWebhookHooks({ userId: ctx.auth.user.id });
  }),
  listIncomingWebhooks: protectedProcedure.query(async ({ ctx }) => {
    return requireAutomationRepository(ctx.automationRepository).incomingWebhooks.listSafe({ userId: ctx.auth.user.id });
  }),
  previewIncomingWebhookMapping: protectedProcedure.input(previewIncomingWebhookInputSchema).mutation(({ input }) => {
    return mapIncomingWebhookPayload(input.mappingConfig, input.payload);
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
  createOutgoingWebhookHook: protectedProcedure.input(createOutgoingWebhookHookInputSchema).mutation(async ({ ctx, input }) => {
    const secretCrypto = requireSecretCrypto(ctx.secretCrypto);
    return requireAutomationRepository(ctx.automationRepository).hooks.createOutgoingWebhookHook({
      id: crypto.randomUUID(),
      userId: ctx.auth.user.id,
      name: input.name.trim(),
      eventType: parseCoreEventType(input.eventType),
      enabled: input.enabled,
      url: input.url.trim(),
      auth: encryptOutgoingWebhookAuth(input.auth, secretCrypto),
      headers: input.headers,
      retryPolicy: input.retryPolicy,
      now: new Date(),
    });
  }),
  createIncomingWebhook: protectedProcedure.input(createIncomingWebhookInputSchema).mutation(async ({ ctx, input }) => {
    const automationRepository = requireAutomationRepository(ctx.automationRepository);
    const normalized = normalizeIncomingWebhookCreate({
      id: crypto.randomUUID(),
      userId: ctx.auth.user.id,
      name: input.name,
      slug: input.slug,
      token: input.token || null,
      targetEventType: input.targetEventType,
      mappingConfig: input.mappingConfig,
      now: new Date(),
    });
    const saved = await automationRepository.incomingWebhooks.create(normalized);
    return { ...saved, token: normalized.rawToken };
  }),
  updateIncomingWebhookMode: protectedProcedure.input(updateIncomingWebhookModeInputSchema).mutation(async ({ ctx, input }) => {
    return requireAutomationRepository(ctx.automationRepository).incomingWebhooks.updateMode({ userId: ctx.auth.user.id, id: input.id, mode: input.mode, now: new Date() });
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

function requireSecretCrypto(secretCrypto: SecretCrypto | undefined): SecretCrypto {
  if (!secretCrypto) {
    throw new Error("Secret crypto is required for outgoing webhook credentials.");
  }
  return secretCrypto;
}

function encryptOutgoingWebhookAuth(auth: z.infer<typeof outgoingWebhookAuthInputSchema>, secretCrypto: SecretCrypto): Record<string, unknown> {
  switch (auth.type) {
    case "none":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", token: secretCrypto.encrypt(auth.token) };
    case "basic":
      return { type: "basic", username: auth.username, password: secretCrypto.encrypt(auth.password) };
    case "hmac":
      return { type: "hmac", secret: secretCrypto.encrypt(auth.secret), headerName: auth.headerName };
    case "custom_headers":
      return { type: "custom_headers", headers: auth.headers.map((header) => ({ name: header.name, value: secretCrypto.encrypt(header.value) })) };
  }
}
