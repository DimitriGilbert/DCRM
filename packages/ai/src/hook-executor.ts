import { randomUUID } from "node:crypto";

import { chat } from "@tanstack/ai";
import type { AnyTextAdapter, SchemaInput } from "@tanstack/ai";
import type { ZodType } from "zod";

import type { ProviderManager, ProviderRecord } from "./provider-manager";
import { buildStructuredOutputConfig } from "./structured-output";
import { applyFieldMapping, type FieldMapping, type FieldMappingResult } from "./field-mapper";
import { getBuiltinTemplate, type HookTemplate } from "./templates";

// --- Types ---

/**
 * Write behavior for AI hook output.
 * - propose_first: store as insight, user must explicitly accept changes.
 * - direct_write: apply mapped fields to the entity immediately.
 */
export type HookWriteBehavior = "propose_first" | "direct_write";

/**
 * Configuration stored in the hooks table for AI hooks.
 */
export type AIHookConfig = {
  /** Built-in template ID or "custom". */
  readonly templateId?: string;
  /** Provider record ID from ai_providers table. */
  readonly providerId: string;
  /** Model override (optional, falls back to provider default). */
  readonly model?: string;
  /** Custom system prompt (overrides template). */
  readonly systemPrompt?: string;
  /** Custom user prompt template (overrides template). */
  readonly userPromptTemplate?: string;
  /** JSON Schema for structured output (overrides template schema). */
  readonly outputSchema?: Record<string, unknown>;
  /** Field mapping from AI output to CRM entity fields. */
  readonly fieldMapping?: FieldMapping;
  /** Temperature for generation. */
  readonly temperature?: number;
  /** Max tokens for generation. */
  readonly maxTokens?: number;
};

/**
 * Input to the AI hook executor, derived from event context.
 */
export type AIHookExecutionInput = {
  readonly hookId: string;
  readonly hookName: string;
  readonly userId: string;
  readonly eventId: string;
  readonly executionId: string;
  readonly config: AIHookConfig;
  readonly writeBehavior: HookWriteBehavior;
  readonly emitDownstreamEvents: boolean;
  readonly eventType: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly eventPayload: Record<string, unknown>;
};

/**
 * Result of executing an AI hook.
 */
export type AIHookExecutionResult = {
  /** AI insight ID. */
  readonly insightId: string;
  /** The raw structured output from AI. */
  readonly structuredOutput: Record<string, unknown>;
  /** Result of field mapping (if applicable). */
  readonly fieldMappingResult: FieldMappingResult | null;
  /** Whether the mapped fields were directly applied. */
  readonly applied: boolean;
  /** Provider used. */
  readonly provider: string;
  /** Model used. */
  readonly model: string;
  /** Prompt that was sent. */
  readonly prompt: string;
};

/**
 * Callback for persisting AI insights to the database.
 */
export type AIInsightStore = {
  readonly insert: (record: AIInsightRecord) => Promise<void>;
  readonly update: (id: string, updates: Partial<AIInsightRecord>) => Promise<void>;
};

/**
 * AI insight record matching the ai_insights table shape.
 */
export type AIInsightRecord = {
  readonly id: string;
  readonly userId: string;
  readonly hookExecutionId: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly structuredOutput: Record<string, unknown>;
  readonly fieldMappingResult: Record<string, unknown> | null;
  readonly applied: boolean;
  readonly createdAt: Date;
};

/**
 * Callback for applying mapped fields to a CRM entity.
 */
export type EntityUpdateFn = (
  entityType: string,
  entityId: string,
  userId: string,
  fields: Record<string, unknown>,
  provenance: {
    readonly hookExecutionId: string;
    readonly eventId: string;
    readonly emitDownstreamEvents: boolean;
  },
) => Promise<void>;

/**
 * Callback for fetching entity fields (for merge decisions).
 */
export type EntityFetchFn = (
  entityType: string,
  entityId: string,
  userId: string,
) => Promise<Record<string, unknown> | null>;

// --- Executor ---

/**
 * Resolves the effective prompt, schema, and field mapping from
 * the hook config, falling back to the built-in template if specified.
 */
function resolveTemplateOverrides(config: AIHookConfig): {
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: ZodType<Record<string, unknown>> | undefined;
  fieldMapping: FieldMapping;
} {
  const template: HookTemplate | undefined = config.templateId
    ? getBuiltinTemplate(config.templateId)
    : undefined;

  return {
    systemPrompt: config.systemPrompt ?? template?.systemPrompt ?? "You are a helpful CRM assistant. Return structured output as JSON.",
    userPromptTemplate:
      config.userPromptTemplate ??
      template?.userPromptTemplate ??
      "Analyze the following data and return structured output:\n\n{payload}",
    outputSchema: template?.outputSchema,
    fieldMapping: config.fieldMapping ?? template?.defaultFieldMapping ?? {},
  };
}

/**
 * Builds the user prompt by replacing template variables.
 */
function buildUserPrompt(
  template: string,
  entityType: string,
  payload: Record<string, unknown>,
): string {
  return template
    .replace(/\{entityType\}/g, entityType || "entity")
    .replace(/\{payload\}/g, JSON.stringify(payload, null, 2));
}

/**
 * Extracts the entity kind from a composite event name.
 * e.g. "client.created" → "client", "deal" → "deal"
 */
function extractEntityType(eventType: string): string {
  const dotIndex = eventType.indexOf(".");
  return dotIndex > 0 ? eventType.slice(0, dotIndex) : eventType;
}

/**
 * Execute an AI hook: generate structured output, validate, map fields, and persist.
 *
 * Flow:
 * 1. Resolve template/overrides → prompt, schema, field mapping
 * 2. Create adapter via ProviderManager
 * 3. Call AI with structured output
 * 4. Validate output
 * 5. Apply field mapping
 * 6. Store AI insight
 * 7. If direct_write: apply mapped fields to entity
 */
export async function executeAIHook(
  input: AIHookExecutionInput,
  deps: {
    readonly providerManager: ProviderManager;
    readonly providerStore: {
      readonly getById: (id: string, userId: string) => Promise<ProviderRecord | null>;
    };
    readonly insightStore: AIInsightStore;
    readonly entityUpdateFn: EntityUpdateFn;
    readonly entityFetchFn: EntityFetchFn;
  },
): Promise<AIHookExecutionResult> {
  // 1. Resolve template overrides
  const resolved = resolveTemplateOverrides(input.config);

  // 2. Build prompt
  const userPrompt = buildUserPrompt(
    resolved.userPromptTemplate,
    input.entityType ?? extractEntityType(input.eventType),
    input.eventPayload,
  );
  const fullPrompt = resolved.systemPrompt + "\n\n" + userPrompt;

  // 3. Resolve provider
  const providerRecord = await deps.providerStore.getById(
    input.config.providerId,
    input.userId,
  );
  if (!providerRecord) {
    throw new Error(
      `AI provider not found: ${input.config.providerId}`,
    );
  }
  if (!providerRecord.enabled) {
    throw new Error(
      `AI provider is disabled: ${input.config.providerId}`,
    );
  }

  const providerConfig = deps.providerManager.buildConfig(providerRecord);
  const adapter: AnyTextAdapter = deps.providerManager.createAdapter(
    providerConfig,
    input.config.model,
  );
  const model = input.config.model ?? providerConfig.defaultModel;

  // 4. Call AI with structured output
  let structuredOutput: Record<string, unknown>;

  const chatOptions = {
    adapter,
    systemPrompts: [resolved.systemPrompt],
    messages: [
      {
        role: "user" as const,
        content: userPrompt,
      },
    ],
    stream: false as const,
    ...(input.config.temperature !== undefined ? { temperature: input.config.temperature } : {}),
    ...(input.config.maxTokens !== undefined ? { maxTokens: input.config.maxTokens } : {}),
  };

  if (resolved.outputSchema) {
    const structuredConfig = buildStructuredOutputConfig(
      resolved.outputSchema,
    );

    // Use TanStack AI chat with outputSchema for structured generation
    const result = await chat({
      ...chatOptions,
      outputSchema: structuredConfig.schema as SchemaInput,
    });

    structuredOutput = result as Record<string, unknown>;
  } else {
    // No schema: use plain text chat and parse JSON from response
    const textResult = await chat(chatOptions);

    const text = textResult as string;
    try {
      const parsed = JSON.parse(text);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        structuredOutput = { raw_text: text };
      } else {
        structuredOutput = parsed as Record<string, unknown>;
      }
    } catch {
      structuredOutput = { raw_text: text };
    }
  }

  // 5. Structured output is already validated by TanStack AI when outputSchema is provided.
  // No additional validation step needed — the adapter enforces schema conformance.

  // 6. Apply field mapping
  let fieldMappingResult: FieldMappingResult | null = null;

  const hasEntityTarget =
    input.entityType !== undefined &&
    input.entityId !== undefined &&
    Object.keys(resolved.fieldMapping).length > 0;

  let applied = false;

  if (hasEntityTarget) {
    const existing = await deps.entityFetchFn(
      input.entityType!,
      input.entityId!,
      input.userId,
    );

    fieldMappingResult = applyFieldMapping(structuredOutput, resolved.fieldMapping, {
      existingFields: existing ?? undefined,
      overwrite: input.writeBehavior === "direct_write",
    });
  }

  // 7. Store insight before entity update to prevent data loss
  const insightId = randomUUID();
  const insightRecord: AIInsightRecord = {
    id: insightId,
    userId: input.userId,
    hookExecutionId: input.executionId,
    entityType: input.entityType ?? "unknown",
    entityId: input.entityId ?? "unknown",
    provider: providerRecord.provider,
    model,
    prompt: fullPrompt,
    structuredOutput,
    fieldMappingResult: fieldMappingResult
      ? {
          fields: fieldMappingResult.fields,
          unmapped: fieldMappingResult.unmapped,
          totalFields: fieldMappingResult.totalFields,
          mappedCount: fieldMappingResult.mappedCount,
        }
      : null,
    applied: false,
    createdAt: new Date(),
  };

  await deps.insightStore.insert(insightRecord);

  // 8. Direct write: apply mapped fields after storing insight
  if (
    hasEntityTarget &&
    input.writeBehavior === "direct_write" &&
    fieldMappingResult &&
    fieldMappingResult.mappedCount > 0
  ) {
    try {
      await deps.entityUpdateFn(
        input.entityType!,
        input.entityId!,
        input.userId,
        fieldMappingResult.fields,
        {
          hookExecutionId: input.executionId,
          eventId: input.eventId,
          emitDownstreamEvents: input.emitDownstreamEvents,
        },
      );
      applied = true;
      await deps.insightStore.update(insightRecord.id, { applied: true });
    } catch (error) {
      console.error("[AI hook-executor] Entity update failed:", error);
    }
  }

  return {
    insightId,
    structuredOutput,
    fieldMappingResult,
    applied,
    provider: providerRecord.provider,
    model,
    prompt: fullPrompt,
  };
}
