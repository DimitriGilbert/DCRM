import { createDb } from "@DCRM/db";
import { aiInsights, aiMessages, aiProviders, events, hookExecutions, hooks, incomingWebhooks } from "@DCRM/db/schema/automation-integrations";
import { isCoreEventType } from "@DCRM/events";
import { and, desc, eq, isNull } from "drizzle-orm";

import { parseSafeOutgoingWebhookUrl } from "./outgoing-webhook-url.js";

import type { AiHookConfigRecord, AiInsightRecord, AiMessageRecord, AiProviderEncryptedRecord, AiProviderSafeRecord, AutomationRepository, HookExecutionStatusRecord, IncomingWebhookSafeRecord, IncomingWebhookStoredRecord, OutgoingWebhookHookSafeRecord } from "./repository.js";

type AutomationDatabase = ReturnType<typeof createDb>;

const aiProviderSafeSelection = {
  id: aiProviders.id,
  userId: aiProviders.userId,
  name: aiProviders.name,
  type: aiProviders.type,
  baseUrl: aiProviders.baseUrl,
  defaultModel: aiProviders.defaultModel,
  enabled: aiProviders.enabled,
  createdAt: aiProviders.createdAt,
  updatedAt: aiProviders.updatedAt,
};

export function createDrizzleAutomationRepository(database: AutomationDatabase = createDb()): AutomationRepository {
  return {
    aiProviders: {
      async listSafe(input) {
        const rows = await database
          .select({
            id: aiProviders.id,
            userId: aiProviders.userId,
            name: aiProviders.name,
            type: aiProviders.type,
            baseUrl: aiProviders.baseUrl,
            defaultModel: aiProviders.defaultModel,
            enabled: aiProviders.enabled,
            createdAt: aiProviders.createdAt,
            updatedAt: aiProviders.updatedAt,
          })
          .from(aiProviders)
          .where(and(eq(aiProviders.userId, input.userId), isNull(aiProviders.deletedAt)))
          .orderBy(desc(aiProviders.createdAt));

        return rows.map((row): AiProviderSafeRecord => ({ ...row, hasApiKey: true }));
      },
      async upsertEncrypted(input) {
        const rows = input.id
          ? await database
              .update(aiProviders)
              .set({
                name: input.name,
                type: input.type,
                encryptedApiKey: input.encryptedApiKey,
                baseUrl: input.baseUrl,
                defaultModel: input.defaultModel,
                enabled: input.enabled,
                updatedAt: input.now,
                deletedAt: null,
              })
              .where(and(eq(aiProviders.id, input.id), eq(aiProviders.userId, input.userId)))
              .returning(aiProviderSafeSelection)
          : await database
              .insert(aiProviders)
              .values({
                id: crypto.randomUUID(),
                userId: input.userId,
                name: input.name,
                type: input.type,
                encryptedApiKey: input.encryptedApiKey,
                baseUrl: input.baseUrl,
                defaultModel: input.defaultModel,
                enabled: input.enabled,
                createdAt: input.now,
                updatedAt: input.now,
              })
              .returning(aiProviderSafeSelection);

        const row = rows[0];
        if (!row) {
          throw new Error("AI provider was not saved.");
        }
        return { ...row, hasApiKey: true };
      },
      async getDecrypted(input) {
        const rows = await database
          .select({
            id: aiProviders.id,
            userId: aiProviders.userId,
            name: aiProviders.name,
            type: aiProviders.type,
            encryptedApiKey: aiProviders.encryptedApiKey,
            baseUrl: aiProviders.baseUrl,
            defaultModel: aiProviders.defaultModel,
            enabled: aiProviders.enabled,
            createdAt: aiProviders.createdAt,
            updatedAt: aiProviders.updatedAt,
          })
          .from(aiProviders)
          .where(and(eq(aiProviders.id, input.id), eq(aiProviders.userId, input.userId), isNull(aiProviders.deletedAt)))
          .limit(1);
        const row = rows[0];
        return row ? { ...row, hasApiKey: true, apiKey: input.crypto.decrypt(row.encryptedApiKey) } : null;
      },
      async listEncrypted(input) {
        const rows = await database
          .select({
            id: aiProviders.id,
            userId: aiProviders.userId,
            name: aiProviders.name,
            type: aiProviders.type,
            encryptedApiKey: aiProviders.encryptedApiKey,
            baseUrl: aiProviders.baseUrl,
            defaultModel: aiProviders.defaultModel,
            enabled: aiProviders.enabled,
            createdAt: aiProviders.createdAt,
            updatedAt: aiProviders.updatedAt,
          })
          .from(aiProviders)
          .where(and(eq(aiProviders.userId, input.userId), isNull(aiProviders.deletedAt)));

        return rows.map((row): AiProviderEncryptedRecord => ({ ...row, hasApiKey: true }));
      },
    },
    hookExecutions: {
      async listFailures(input) {
        const rows = await database
          .select({
            id: hookExecutions.id,
            userId: hookExecutions.userId,
            hookId: hookExecutions.hookId,
            hookName: hooks.name,
            eventId: hookExecutions.eventId,
            eventType: events.type,
            status: hookExecutions.status,
            error: hookExecutions.error,
            attempt: hookExecutions.attempt,
            maxAttempts: hookExecutions.maxAttempts,
            queuedAt: hookExecutions.queuedAt,
            startedAt: hookExecutions.startedAt,
            finishedAt: hookExecutions.finishedAt,
            nextRetryAt: hookExecutions.nextRetryAt,
            createdAt: hookExecutions.createdAt,
          })
          .from(hookExecutions)
          .innerJoin(hooks, eq(hookExecutions.hookId, hooks.id))
          .innerJoin(events, eq(hookExecutions.eventId, events.id))
          .where(and(eq(hookExecutions.userId, input.userId), eq(hookExecutions.status, "failed")))
          .orderBy(desc(hookExecutions.createdAt))
          .limit(input.limit ?? 10);

        return rows.map((row): HookExecutionStatusRecord => ({
          id: row.id,
          userId: row.userId,
          hookId: row.hookId,
          hookName: row.hookName,
          eventId: row.eventId,
          eventType: row.eventType,
          status: row.status,
          error: row.error,
          attempt: row.attempt,
          maxAttempts: row.maxAttempts,
          queuedAt: row.queuedAt,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          nextRetryAt: row.nextRetryAt,
          createdAt: row.createdAt,
        }));
      },
    },
    hooks: {
      async createAiHook(input) {
        const config = {
          providerId: input.providerId,
          model: input.model,
          template: input.template,
          ...(input.prompt ? { prompt: input.prompt } : {}),
          outputFields: input.outputFields,
          fieldMappings: input.fieldMappings,
          writeBehavior: input.writeBehavior,
          downstreamEventBehavior: input.downstreamEventBehavior,
        };
        const rows = await database
          .insert(hooks)
          .values({
            id: input.id,
            userId: input.userId,
            name: input.name,
            eventType: input.eventType,
            type: "ai",
            enabled: input.enabled,
            config,
            outputSchema: { fields: input.outputFields },
            fieldMapping: { mappings: input.fieldMappings },
            writeBehavior: input.writeBehavior,
            downstreamEventBehavior: input.downstreamEventBehavior,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error("AI hook was not saved.");
        }
        return {
          id: row.id,
          userId: row.userId,
          name: row.name,
          eventType: requireCoreEventType(row.eventType),
          type: "ai",
          enabled: row.enabled,
          config: row.config,
          outputSchema: row.outputSchema,
          fieldMapping: row.fieldMapping,
          writeBehavior: row.writeBehavior,
          downstreamEventBehavior: row.downstreamEventBehavior,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } satisfies AiHookConfigRecord;
      },
      async createOutgoingWebhookHook(input) {
        const config = {
          url: input.url,
          auth: input.auth,
          headers: input.headers,
          retryPolicy: input.retryPolicy,
        };
        const rows = await database
          .insert(hooks)
          .values({
            id: input.id,
            userId: input.userId,
            name: input.name,
            eventType: input.eventType,
            type: "outgoing_webhook",
            enabled: input.enabled,
            config,
            outputSchema: {},
            fieldMapping: {},
            writeBehavior: "propose",
            downstreamEventBehavior: "suppress",
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error("Outgoing webhook hook was not saved.");
        }
        return toSafeOutgoingWebhookHook(row);
      },
      async listAiHooks(input) {
        const rows = await database
          .select()
          .from(hooks)
          .where(and(eq(hooks.userId, input.userId), eq(hooks.type, "ai"), isNull(hooks.deletedAt)))
          .orderBy(desc(hooks.createdAt));
        return rows.map((row): AiHookConfigRecord => ({
          id: row.id,
          userId: row.userId,
          name: row.name,
          eventType: requireCoreEventType(row.eventType),
          type: "ai",
          enabled: row.enabled,
          config: row.config,
          outputSchema: row.outputSchema,
          fieldMapping: row.fieldMapping,
          writeBehavior: row.writeBehavior,
          downstreamEventBehavior: row.downstreamEventBehavior,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },
      async listOutgoingWebhookHooks(input) {
        const rows = await database
          .select()
          .from(hooks)
          .where(and(eq(hooks.userId, input.userId), eq(hooks.type, "outgoing_webhook"), isNull(hooks.deletedAt)))
          .orderBy(desc(hooks.createdAt));
        return rows.map(toSafeOutgoingWebhookHook);
      },
      async listEnabledForEvent(input) {
        const rows = await database
          .select()
          .from(hooks)
          .where(and(eq(hooks.userId, input.userId), eq(hooks.eventType, input.eventType), eq(hooks.enabled, true), isNull(hooks.deletedAt)))
          .orderBy(desc(hooks.createdAt));
        return rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          name: row.name,
          eventType: requireCoreEventType(row.eventType),
          type: row.type,
          enabled: row.enabled,
          config: row.config,
        }));
      },
      async getById(hookId) {
        const rows = await database.select().from(hooks).where(and(eq(hooks.id, hookId), isNull(hooks.deletedAt))).limit(1);
        const row = rows[0];
        return row
          ? {
              id: row.id,
              userId: row.userId,
              name: row.name,
              eventType: requireCoreEventType(row.eventType),
              type: row.type,
              enabled: row.enabled,
              config: row.config,
            }
          : undefined;
      },
    },
    aiInsights: {
      async create(input) {
        const rows = await database
          .insert(aiInsights)
          .values({
            id: input.id,
            userId: input.userId,
            providerId: input.providerId ?? null,
            hookExecutionId: input.hookExecutionId ?? null,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            title: input.title,
            content: input.content,
            structuredOutput: input.structuredOutput,
            metadata: input.metadata,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error("AI insight was not saved.");
        }
        return {
          id: row.id,
          userId: row.userId,
          providerId: row.providerId,
          hookExecutionId: row.hookExecutionId,
          entityType: row.entityType,
          entityId: row.entityId,
          title: row.title,
          content: row.content,
          structuredOutput: row.structuredOutput,
          metadata: row.metadata,
          now: row.createdAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } satisfies AiInsightRecord;
      },
      async listForUser(input) {
        const rows = await database.select().from(aiInsights).where(eq(aiInsights.userId, input.userId)).orderBy(desc(aiInsights.createdAt));
        return rows.map((row): AiInsightRecord => ({
          id: row.id,
          userId: row.userId,
          providerId: row.providerId,
          hookExecutionId: row.hookExecutionId,
          entityType: row.entityType,
          entityId: row.entityId,
          title: row.title,
          content: row.content,
          structuredOutput: row.structuredOutput,
          metadata: row.metadata,
          now: row.createdAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },
    },
    aiMessages: {
      async create(input) {
        const rows = await database
          .insert(aiMessages)
          .values({
            id: input.id,
            userId: input.userId,
            providerId: input.providerId ?? null,
            conversationId: input.conversationId,
            role: input.role,
            content: input.content,
            toolCalls: input.toolCalls,
            metadata: input.metadata,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error("AI chat message was not saved.");
        }
        return {
          id: row.id,
          userId: row.userId,
          providerId: row.providerId,
          conversationId: row.conversationId,
          role: requireAiMessageRole(row.role),
          content: row.content,
          toolCalls: row.toolCalls,
          metadata: row.metadata,
          now: row.createdAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } satisfies AiMessageRecord;
      },
      async listConversation(input) {
        const rows = await database
          .select()
          .from(aiMessages)
          .where(and(eq(aiMessages.userId, input.userId), eq(aiMessages.conversationId, input.conversationId)))
          .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
          .limit(input.limit ?? 40);
        return rows
          .map((row): AiMessageRecord => ({
            id: row.id,
            userId: row.userId,
            providerId: row.providerId,
            conversationId: row.conversationId,
            role: requireAiMessageRole(row.role),
            content: row.content,
            toolCalls: row.toolCalls,
            metadata: row.metadata,
            now: row.createdAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }))
          .toReversed();
      },
    },
    incomingWebhooks: {
      async create(input) {
        const rows = await database
          .insert(incomingWebhooks)
          .values({
            id: input.id,
            userId: input.userId,
            name: input.name,
            slug: input.slug,
            enabled: input.enabled,
            mode: input.mode,
            tokenHash: input.tokenHash,
            mappingConfig: input.mappingConfig,
            targetEventType: input.targetEventType,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new Error("Incoming webhook was not saved.");
        }
        return toSafeIncomingWebhook({ ...row, targetEventType: requireCoreEventType(row.targetEventType) });
      },
      async listSafe(input) {
        const rows = await database.select().from(incomingWebhooks).where(and(eq(incomingWebhooks.userId, input.userId), isNull(incomingWebhooks.deletedAt))).orderBy(desc(incomingWebhooks.createdAt));
        return rows.map((row) => toSafeIncomingWebhook({ ...row, targetEventType: requireCoreEventType(row.targetEventType) }));
      },
      async getBySlug(slug) {
        const rows = await database.select().from(incomingWebhooks).where(and(eq(incomingWebhooks.slug, slug), isNull(incomingWebhooks.deletedAt))).limit(1);
        const row = rows[0];
        return row ? { ...toSafeIncomingWebhook({ ...row, targetEventType: requireCoreEventType(row.targetEventType) }), tokenHash: row.tokenHash, lastTestPayload: row.lastTestPayload } : null;
      },
      async updateMode(input) {
        const rows = await database.update(incomingWebhooks).set({ mode: input.mode, updatedAt: input.now }).where(and(eq(incomingWebhooks.id, input.id), eq(incomingWebhooks.userId, input.userId), isNull(incomingWebhooks.deletedAt))).returning();
        const row = rows[0];
        if (!row) {
          throw new Error("Incoming webhook was not found.");
        }
        return toSafeIncomingWebhook({ ...row, targetEventType: requireCoreEventType(row.targetEventType) });
      },
      async recordTestPayload(input) {
        await database.update(incomingWebhooks).set({ lastTestPayload: input.payload, updatedAt: input.now }).where(eq(incomingWebhooks.id, input.id));
      },
    },
  };
}

function requireCoreEventType(value: string) {
  if (!isCoreEventType(value)) {
    throw new Error(`Unsupported hook event type stored in automation repository: ${value}`);
  }
  return value;
}

function toSafeIncomingWebhook(row: Omit<IncomingWebhookStoredRecord, "hasToken">): IncomingWebhookSafeRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    enabled: row.enabled,
    mode: row.mode,
    targetEventType: row.targetEventType,
    mappingConfig: row.mappingConfig,
    hasToken: row.tokenHash !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSafeOutgoingWebhookHook(row: { readonly id: string; readonly userId: string; readonly name: string; readonly eventType: string; readonly enabled: boolean; readonly config: Record<string, unknown>; readonly createdAt: Date; readonly updatedAt: Date }): OutgoingWebhookHookSafeRecord {
  const auth = isJsonObject(row.config.auth) ? row.config.auth : { type: "none" };
  const authType = isWebhookAuthType(auth.type) ? auth.type : "none";
  const customHeaderNames = authType === "custom_headers" && Array.isArray(auth.headers)
    ? auth.headers.map((header) => (isJsonObject(header) && typeof header.name === "string" ? header.name : "")).filter((name) => name.length > 0)
    : [];
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    eventType: requireCoreEventType(row.eventType),
    type: "outgoing_webhook",
    enabled: row.enabled,
    url: safeOutgoingWebhookListUrl(row.config.url),
    authType,
    customHeaderNames,
    retryPolicy: isJsonObject(row.config.retryPolicy) ? row.config.retryPolicy : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeOutgoingWebhookListUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  try {
    parseSafeOutgoingWebhookUrl(value);
    return value;
  } catch {
    return "";
  }
}

function isWebhookAuthType(value: unknown): value is OutgoingWebhookHookSafeRecord["authType"] {
  return value === "none" || value === "bearer" || value === "basic" || value === "hmac" || value === "custom_headers";
}

function requireAiMessageRole(value: string) {
  if (value === "user" || value === "assistant" || value === "tool") {
    return value;
  }
  throw new Error(`Unsupported AI message role stored in automation repository: ${value}`);
}
