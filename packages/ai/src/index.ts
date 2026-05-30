import { AI_HOOK_TEMPLATES, AI_PROVIDER_TYPES } from "@DCRM/domain";
import { chat } from "@tanstack/ai";
import { type AnyTextAdapter } from "@tanstack/ai/adapters";
import { AnthropicTextAdapter } from "@tanstack/ai-anthropic";
import type { AnthropicChatModel } from "@tanstack/ai-anthropic";
import { GeminiTextAdapter } from "@tanstack/ai-gemini";
import type { GeminiTextModel } from "@tanstack/ai-gemini";
import { OpenAITextAdapter } from "@tanstack/ai-openai";
import type { OpenAIChatModel } from "@tanstack/ai-openai";
import { z } from "zod";

import type { AiHookTemplate, AiProviderType, DownstreamEventBehavior, HookWriteBehavior } from "@DCRM/domain";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const providerSettingsInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(AI_PROVIDER_TYPES),
  apiKey: z.string().trim().min(1),
  baseUrl: z.url().optional().or(z.literal("")),
  defaultModel: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
});

export type ProviderSettingsInput = z.infer<typeof providerSettingsInputSchema>;

export type AiTextAdapterOptions = {
  readonly type: AiProviderType;
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string | null;
};

export const aiHookOutputFieldSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["string", "number", "boolean", "string_array"]),
  required: z.boolean().default(false),
});

export const aiHookFieldMappingSchema = z.object({
  sourcePath: z.string().trim().min(1),
  targetField: z.string().trim().min(1),
});

export const aiHookConfigSchema = z.object({
  providerId: z.string().trim().min(1),
  model: z.string().trim().min(1),
  template: z.enum(AI_HOOK_TEMPLATES),
  prompt: z.string().trim().min(1).optional(),
  outputFields: z.array(aiHookOutputFieldSchema).min(1),
  fieldMappings: z.array(aiHookFieldMappingSchema).default([]),
  writeBehavior: z.enum(["propose", "direct"]),
  downstreamEventBehavior: z.enum(["suppress", "emit"]).default("suppress"),
});

export type AiHookOutputField = z.infer<typeof aiHookOutputFieldSchema>;
export type AiHookFieldMapping = z.infer<typeof aiHookFieldMappingSchema>;
export type AiHookConfig = z.infer<typeof aiHookConfigSchema>;

export type AiHookEventContext = {
  readonly id: string;
  readonly type: string;
  readonly userId: string;
  readonly source: string;
  readonly entity?: {
    readonly type: string;
    readonly id: string;
  };
  readonly payload: JsonObject;
  readonly changes?: JsonObject;
  readonly createdAt: Date;
};

export type AiHookExecutionContext = {
  readonly event: AiHookEventContext;
  readonly hook: {
    readonly id: string;
    readonly userId: string;
    readonly name: string;
    readonly config: JsonObject;
  };
  readonly execution: {
    readonly id: string;
  };
};

export type AiHookModelRequest = {
  readonly userId: string;
  readonly providerId: string;
  readonly model: string;
  readonly prompt: string;
  readonly outputFields: readonly AiHookOutputField[];
};

export type AiHookModelRunner = {
  readonly generateStructured: (request: AiHookModelRequest) => Promise<unknown>;
};

export type AiHookProviderCredentials = {
  readonly type: AiProviderType;
  readonly apiKey: string;
  readonly baseUrl?: string | null;
  readonly enabled: boolean;
};

export type GenerateStructuredWithProviderInput = {
  readonly provider: AiHookProviderCredentials;
  readonly request: AiHookModelRequest;
};

export type StructuredAiGenerator = (input: GenerateStructuredWithProviderInput) => Promise<unknown>;

export type StoreAiInsightInput = {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly hookExecutionId: string;
  readonly entity?: {
    readonly type: string;
    readonly id: string;
  };
  readonly title: string;
  readonly content: string;
  readonly structuredOutput: JsonObject;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
};

export type AiInsightStore = {
  readonly create: (input: StoreAiInsightInput) => Promise<void>;
};

export type ApplyAiFieldChangesInput = {
  readonly userId: string;
  readonly entity: {
    readonly type: string;
    readonly id: string;
  };
  readonly changes: JsonObject;
  readonly provenance: {
    readonly hookId: string;
    readonly hookExecutionId: string;
    readonly triggeringEventId: string;
  };
  readonly downstreamEventBehavior: DownstreamEventBehavior;
};

export type AiFieldWriter = {
  readonly apply: (input: ApplyAiFieldChangesInput) => Promise<JsonObject>;
};

export type ExecuteStructuredAiHookOptions = {
  readonly context: AiHookExecutionContext;
  readonly runner: AiHookModelRunner;
  readonly insights: AiInsightStore;
  readonly fieldWriter?: AiFieldWriter;
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
};

export type AiHookExecutionResult = {
  readonly insightId: string;
  readonly writeBehavior: HookWriteBehavior;
  readonly structuredOutput: JsonObject;
  readonly proposedChanges: JsonObject;
  readonly appliedChanges?: JsonObject;
};

export type CrmChatRole = "user" | "assistant" | "tool";

export type CrmChatMessage = {
  readonly role: CrmChatRole;
  readonly content: string;
  readonly name?: string;
};

export type CrmChatToolResult = {
  readonly name: string;
  readonly input: JsonObject;
  readonly output: JsonObject;
};

export type CrmChatGenerateInput = {
  readonly provider: AiHookProviderCredentials;
  readonly model: string;
  readonly messages: readonly CrmChatMessage[];
  readonly toolResults: readonly CrmChatToolResult[];
};

export type CrmChatGenerateResult = {
  readonly content: string;
};

export type CrmChatRunner = {
  readonly generate: (input: CrmChatGenerateInput) => Promise<CrmChatGenerateResult>;
};

export const BUILT_IN_AI_HOOK_TEMPLATES = {
  summarize: {
    title: "Summarize",
    prompt: "Summarize the CRM event context into concise, useful notes.",
    outputFields: [{ name: "summary", type: "string", required: true }],
  },
  classify: {
    title: "Classify",
    prompt: "Classify the CRM event context with a label and confidence score.",
    outputFields: [
      { name: "label", type: "string", required: true },
      { name: "confidence", type: "number", required: true },
    ],
  },
  extract_contacts: {
    title: "Extract contacts",
    prompt: "Extract contact details from the CRM event context.",
    outputFields: [
      { name: "name", type: "string", required: false },
      { name: "email", type: "string", required: false },
      { name: "phone", type: "string", required: false },
    ],
  },
  enrich_from_web: {
    title: "Enrich from web",
    prompt: "Use provided web context to enrich the CRM record with useful business details.",
    outputFields: [
      { name: "company", type: "string", required: false },
      { name: "website", type: "string", required: false },
      { name: "notes", type: "string", required: false },
    ],
  },
} satisfies Record<AiHookTemplate, { readonly title: string; readonly prompt: string; readonly outputFields: readonly AiHookOutputField[] }>;

/** Executes a structured AI hook from an event context, validates output, stores insight, and maps fields. */
export async function executeStructuredAiHook({
  context,
  runner,
  insights,
  fieldWriter,
  clock = () => new Date(),
  idGenerator = () => crypto.randomUUID(),
}: ExecuteStructuredAiHookOptions): Promise<AiHookExecutionResult> {
  const config = aiHookConfigSchema.parse(context.hook.config);
  const template = BUILT_IN_AI_HOOK_TEMPLATES[config.template];
  const prompt = buildAiHookPrompt({ event: context.event, templatePrompt: config.prompt ?? template.prompt });
  const rawOutput = await runner.generateStructured({ userId: context.event.userId, providerId: config.providerId, model: config.model, prompt, outputFields: config.outputFields });
  const structuredOutput = validateStructuredOutput(rawOutput, config.outputFields);
  const proposedChanges = mapStructuredOutputToFields(structuredOutput, config.fieldMappings);
  const insightId = idGenerator();

  await insights.create({
    id: insightId,
    userId: context.event.userId,
    providerId: config.providerId,
    hookExecutionId: context.execution.id,
    ...(context.event.entity ? { entity: context.event.entity } : {}),
    title: `${template.title}: ${context.hook.name}`,
    content: insightContent(structuredOutput),
    structuredOutput,
    metadata: {
      hookId: context.hook.id,
      eventId: context.event.id,
      writeBehavior: config.writeBehavior,
      proposedChanges,
    },
    createdAt: clock(),
  });

  if (config.writeBehavior === "direct" && Object.keys(proposedChanges).length > 0) {
    if (!context.event.entity) {
      throw new Error("Direct AI hook field writes require an event entity.");
    }
    if (!fieldWriter) {
      throw new Error("Direct AI hook field writes require a field writer.");
    }
    const appliedChanges = await fieldWriter.apply({
      userId: context.event.userId,
      entity: context.event.entity,
      changes: proposedChanges,
      provenance: {
        hookId: context.hook.id,
        hookExecutionId: context.execution.id,
        triggeringEventId: context.event.id,
      },
      downstreamEventBehavior: config.downstreamEventBehavior,
    });
    return { insightId, writeBehavior: config.writeBehavior, structuredOutput, proposedChanges, appliedChanges };
  }

  return { insightId, writeBehavior: config.writeBehavior, structuredOutput, proposedChanges };
}

export function validateStructuredOutput(output: unknown, fields: readonly AiHookOutputField[]): JsonObject {
  const parsed = createAiHookOutputSchema(fields).parse(output);
  return toJsonObject(parsed);
}

export function createAiHookOutputSchema(fields: readonly AiHookOutputField[]): z.ZodObject<Record<string, z.ZodType>> {
  const shape = fields.reduce<Record<string, z.ZodType>>((accumulator, field) => {
    const schema = outputFieldToZod(field);
    accumulator[field.name] = field.required ? schema : schema.optional();
    return accumulator;
  }, {});
  return z.object(shape).passthrough();
}

export function mapStructuredOutputToFields(output: JsonObject, mappings: readonly AiHookFieldMapping[]): JsonObject {
  return mappings.reduce<JsonObject>((changes, mapping) => {
    const value = getPathValue(output, mapping.sourcePath);
    if (value === undefined) {
      return changes;
    }
    return { ...changes, [mapping.targetField]: value };
  }, {});
}

/**
 * Creates a server-side TanStack AI text adapter for a user-owned provider key.
 * OpenRouter intentionally uses TanStack's OpenAI-compatible adapter with the
 * OpenRouter base URL; OpenAI and Anthropic accept user-supplied compatible
 * API base URLs. API keys must never be sent to client code.
 */
export function createAiTextAdapter(options: AiTextAdapterOptions): AnyTextAdapter {
  switch (options.type) {
    case "openrouter":
      return new OpenAITextAdapter(
        { apiKey: options.apiKey, baseURL: normalizeBaseUrl(options.baseUrl) ?? DEFAULT_OPENROUTER_BASE_URL },
        options.model as OpenAIChatModel,
      );
    case "openai":
      return new OpenAITextAdapter(
        { apiKey: options.apiKey, baseURL: normalizeBaseUrl(options.baseUrl) },
        options.model as OpenAIChatModel,
      );
    case "anthropic":
      return new AnthropicTextAdapter(
        { apiKey: options.apiKey, baseURL: normalizeBaseUrl(options.baseUrl) },
        options.model as AnthropicChatModel,
      );
    case "google":
      return new GeminiTextAdapter({ apiKey: options.apiKey }, options.model as GeminiTextModel);
    default:
      return assertNever(options.type);
  }
}

/** Generates a structured AI hook response through the TanStack AI adapter path. */
export async function generateStructuredAiHookWithTanStack({ provider, request }: GenerateStructuredWithProviderInput): Promise<unknown> {
  if (!provider.enabled) {
    throw new Error(`AI provider is disabled: ${request.providerId}`);
  }

  const adapter = createAiTextAdapter({ type: provider.type, apiKey: provider.apiKey, model: request.model, baseUrl: provider.baseUrl });
  return chat({
    adapter,
    messages: [{ role: "user", content: request.prompt }],
    outputSchema: createAiHookOutputSchema(request.outputFields),
  });
}

/** Generates an assistant answer with TanStack AI using audited server-side CRM tool output as context. */
export async function generateCrmChatWithTanStack(input: CrmChatGenerateInput): Promise<CrmChatGenerateResult> {
  if (!input.provider.enabled) {
    throw new Error("AI provider is disabled for chat.");
  }

  const adapter = createAiTextAdapter({ type: input.provider.type, apiKey: input.provider.apiKey, model: input.model, baseUrl: input.provider.baseUrl });
  const messages = [
    ...input.messages,
    {
      role: "user" as const,
      content: [
        "Use only the audited CRM tool results below for CRM data. Do not claim access to any other application data.",
        JSON.stringify(input.toolResults, null, 2),
      ].join("\n"),
    },
  ];
  const response = await chat({ adapter, messages });
  return { content: extractChatText(response) };
}

export function normalizeProviderSettingsInput(input: ProviderSettingsInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    apiKey: input.apiKey.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    defaultModel: input.defaultModel.trim(),
    enabled: input.enabled,
  } satisfies {
    readonly name: string;
    readonly type: AiProviderType;
    readonly apiKey: string;
    readonly baseUrl: string | null;
    readonly defaultModel: string;
    readonly enabled: boolean;
  };
}

function outputFieldToZod(field: AiHookOutputField): z.ZodType {
  switch (field.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "string_array":
      return z.array(z.string());
    default:
      return assertNever(field.type);
  }
}

function buildAiHookPrompt(input: { readonly event: AiHookEventContext; readonly templatePrompt: string }): string {
  return [input.templatePrompt, "", "Event context:", JSON.stringify(eventToPromptObject(input.event), null, 2)].join("\n");
}

function eventToPromptObject(event: AiHookEventContext): JsonObject {
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    ...(event.entity ? { entity: event.entity } : {}),
    payload: event.payload,
    ...(event.changes ? { changes: event.changes } : {}),
    createdAt: event.createdAt.toISOString(),
  };
}

function insightContent(output: JsonObject): string {
  const summary = output.summary;
  return typeof summary === "string" && summary.trim() ? summary : JSON.stringify(output);
}

function getPathValue(source: JsonObject, path: string): JsonValue | undefined {
  return path.split(".").reduce<JsonValue | undefined>((current, segment) => {
    if (!isJsonObject(current)) {
      return undefined;
    }
    return current[segment];
  }, source);
}

function toJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error("Structured AI output must be an object.");
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed : null;
}

function extractChatText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (isRecord(response)) {
    const text = response.text;
    if (typeof text === "string") {
      return text;
    }
    const content = response.content;
    if (typeof content === "string") {
      return content;
    }
  }
  return JSON.stringify(response);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported AI provider type: ${value}`);
}
