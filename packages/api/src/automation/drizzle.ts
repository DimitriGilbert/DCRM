import { createDb } from "@DCRM/db";
import { aiInsights, aiMessages, aiProviders, events, hookExecutions, hooks } from "@DCRM/db/schema/automation-integrations";
import { isCoreEventType } from "@DCRM/events";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { AiHookConfigRecord, AiInsightRecord, AiMessageRecord, AiProviderEncryptedRecord, AiProviderSafeRecord, AutomationRepository, HookExecutionStatusRecord } from "./repository.js";

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
      async listEnabledForEvent(input) {
        const rows = await database
          .select()
          .from(hooks)
          .where(and(eq(hooks.userId, input.userId), eq(hooks.eventType, input.eventType), eq(hooks.type, "ai"), eq(hooks.enabled, true), isNull(hooks.deletedAt)))
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
      async getById(hookId) {
        const rows = await database.select().from(hooks).where(and(eq(hooks.id, hookId), eq(hooks.type, "ai"), isNull(hooks.deletedAt))).limit(1);
        const row = rows[0];
        return row
          ? {
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
  };
}

function requireCoreEventType(value: string) {
  if (!isCoreEventType(value)) {
    throw new Error(`Unsupported hook event type stored in automation repository: ${value}`);
  }
  return value;
}

function requireAiMessageRole(value: string) {
  if (value === "user" || value === "assistant" || value === "tool") {
    return value;
  }
  throw new Error(`Unsupported AI message role stored in automation repository: ${value}`);
}
