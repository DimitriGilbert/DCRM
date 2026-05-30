import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";
import type { AiHookTemplate, AiProviderType, DownstreamEventBehavior, HookExecutionStatus, HookWriteBehavior } from "@DCRM/domain";
import { isCoreEventType } from "@DCRM/events";

import type { CoreEventType } from "@DCRM/events";

type JsonObject = Record<string, unknown>;

export type HookExecutionStatusRecord = {
  readonly id: string;
  readonly userId: string;
  readonly hookId: string;
  readonly hookName: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly status: HookExecutionStatus;
  readonly error: JsonObject | null;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly queuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly nextRetryAt: Date | null;
  readonly createdAt: Date;
};

export type AutomationRepository = {
  readonly aiProviders: {
    readonly listSafe: (input: { readonly userId: string }) => Promise<readonly AiProviderSafeRecord[]>;
    readonly upsertEncrypted: (input: UpsertAiProviderEncryptedInput) => Promise<AiProviderSafeRecord>;
    readonly getDecrypted: (input: { readonly userId: string; readonly id: string; readonly crypto: SecretCrypto }) => Promise<AiProviderDecryptedRecord | null>;
    readonly listEncrypted: (input: { readonly userId: string }) => Promise<readonly AiProviderEncryptedRecord[]>;
  };
  readonly hookExecutions: {
    readonly listFailures: (input: { readonly userId: string; readonly limit?: number }) => Promise<readonly HookExecutionStatusRecord[]>;
  };
  readonly hooks: {
    readonly createAiHook: (input: CreateAiHookInput) => Promise<AiHookConfigRecord>;
    readonly listAiHooks: (input: { readonly userId: string }) => Promise<readonly AiHookConfigRecord[]>;
    readonly listEnabledForEvent: (input: { readonly userId: string; readonly eventType: CoreEventType }) => Promise<readonly AiHookConfigRecord[]>;
    readonly getById: (hookId: string) => Promise<AiHookConfigRecord | undefined>;
  };
  readonly aiInsights: {
    readonly create: (input: CreateAiInsightInput) => Promise<AiInsightRecord>;
    readonly listForUser: (input: { readonly userId: string }) => Promise<readonly AiInsightRecord[]>;
  };
  readonly aiMessages: {
    readonly create: (input: CreateAiMessageInput) => Promise<AiMessageRecord>;
    readonly listConversation: (input: { readonly userId: string; readonly conversationId: string; readonly limit?: number }) => Promise<readonly AiMessageRecord[]>;
  };
};

export type AiHookConfigRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly eventType: CoreEventType;
  readonly type: "ai";
  readonly enabled: boolean;
  readonly config: JsonObject;
  readonly outputSchema: JsonObject;
  readonly fieldMapping: JsonObject;
  readonly writeBehavior: HookWriteBehavior;
  readonly downstreamEventBehavior: DownstreamEventBehavior;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateAiHookInput = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly eventType: CoreEventType;
  readonly enabled: boolean;
  readonly providerId: string;
  readonly model: string;
  readonly template: AiHookTemplate;
  readonly prompt?: string;
  readonly outputFields: readonly JsonObject[];
  readonly fieldMappings: readonly JsonObject[];
  readonly writeBehavior: HookWriteBehavior;
  readonly downstreamEventBehavior: DownstreamEventBehavior;
  readonly now: Date;
};

export type CreateAiInsightInput = {
  readonly id: string;
  readonly userId: string;
  readonly providerId?: string | null;
  readonly hookExecutionId?: string | null;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly title: string;
  readonly content: string;
  readonly structuredOutput: JsonObject;
  readonly metadata: JsonObject;
  readonly now: Date;
};

export type AiInsightRecord = CreateAiInsightInput & {
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AiMessageRole = "user" | "assistant" | "tool";

export type CreateAiMessageInput = {
  readonly id: string;
  readonly userId: string;
  readonly providerId?: string | null;
  readonly conversationId: string;
  readonly role: AiMessageRole;
  readonly content: string;
  readonly toolCalls: JsonObject;
  readonly metadata: JsonObject;
  readonly now: Date;
};

export type AiMessageRecord = CreateAiMessageInput & {
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AiProviderSafeRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly type: AiProviderType;
  readonly baseUrl: string | null;
  readonly defaultModel: string | null;
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AiProviderEncryptedRecord = AiProviderSafeRecord & {
  readonly encryptedApiKey: EncryptedSecretV1;
};

export type AiProviderDecryptedRecord = AiProviderSafeRecord & {
  readonly apiKey: string;
};

export type UpsertAiProviderEncryptedInput = {
  readonly id?: string;
  readonly userId: string;
  readonly name: string;
  readonly type: AiProviderType;
  readonly encryptedApiKey: EncryptedSecretV1;
  readonly baseUrl: string | null;
  readonly defaultModel: string;
  readonly enabled: boolean;
  readonly now: Date;
};

export function createInMemoryAutomationRepository(records: readonly HookExecutionStatusRecord[] = []) {
  const hookExecutionRecords = [...records];
  const aiProviderRecords: AiProviderEncryptedRecord[] = [];
  const hookRecords: AiHookConfigRecord[] = [];
  const insightRecords: AiInsightRecord[] = [];
  const messageRecords: AiMessageRecord[] = [];
  return {
    aiProviders: {
      async listSafe(input) {
        return aiProviderRecords.filter((record) => record.userId === input.userId).map(toSafeAiProvider);
      },
      async upsertEncrypted(input) {
        if (!input.id) {
          const record: AiProviderEncryptedRecord = {
            id: crypto.randomUUID(),
            userId: input.userId,
            name: input.name,
            type: input.type,
            encryptedApiKey: input.encryptedApiKey,
            baseUrl: input.baseUrl,
            defaultModel: input.defaultModel,
            enabled: input.enabled,
            hasApiKey: true,
            createdAt: input.now,
            updatedAt: input.now,
          };
          aiProviderRecords.push(record);
          return toSafeAiProvider(record);
        }

        const existingIndex = aiProviderRecords.findIndex((record) => record.id === input.id && record.userId === input.userId);
        const existing = existingIndex >= 0 ? aiProviderRecords[existingIndex] : undefined;
        if (!existing) {
          throw new Error("AI provider was not found.");
        }

        const record: AiProviderEncryptedRecord = {
          id: input.id,
          userId: input.userId,
          name: input.name,
          type: input.type,
          encryptedApiKey: input.encryptedApiKey,
          baseUrl: input.baseUrl,
          defaultModel: input.defaultModel,
          enabled: input.enabled,
          hasApiKey: true,
          createdAt: existing?.createdAt ?? input.now,
          updatedAt: input.now,
        };
        aiProviderRecords[existingIndex] = record;
        return toSafeAiProvider(record);
      },
      async getDecrypted(input) {
        const record = aiProviderRecords.find((candidate) => candidate.id === input.id && candidate.userId === input.userId);
        return record ? { ...toSafeAiProvider(record), apiKey: input.crypto.decrypt(record.encryptedApiKey) } : null;
      },
      async listEncrypted(input) {
        return aiProviderRecords.filter((record) => record.userId === input.userId);
      },
    },
    hookExecutions: {
      async listFailures(input) {
        return hookExecutionRecords
          .filter((record) => record.userId === input.userId && record.status === "failed")
          .slice()
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, input.limit ?? 10);
      },
    },
    hooks: {
      async createAiHook(input) {
        const record = createAiHookRecord(input);
        hookRecords.push(record);
        return record;
      },
      async listAiHooks(input) {
        return hookRecords.filter((record) => record.userId === input.userId);
      },
      async listEnabledForEvent(input) {
        return hookRecords.filter((record) => record.userId === input.userId && record.eventType === input.eventType && record.enabled);
      },
      async getById(hookId) {
        const record = hookRecords.find((candidate) => candidate.id === hookId);
        if (!record || !isCoreEventType(record.eventType)) {
          return undefined;
        }
        return record;
      },
    },
    aiInsights: {
      async create(input) {
        const record: AiInsightRecord = { ...input, createdAt: input.now, updatedAt: input.now };
        insightRecords.push(record);
        return record;
      },
      async listForUser(input) {
        return insightRecords.filter((record) => record.userId === input.userId);
      },
    },
    aiMessages: {
      async create(input) {
        const record: AiMessageRecord = { ...input, createdAt: input.now, updatedAt: input.now };
        messageRecords.push(record);
        return record;
      },
      async listConversation(input) {
        return messageRecords
          .filter((record) => record.userId === input.userId && record.conversationId === input.conversationId)
          .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
          .slice(-(input.limit ?? 40));
      },
    },
  } satisfies AutomationRepository;
}

function createAiHookRecord(input: CreateAiHookInput): AiHookConfigRecord {
  const outputSchema = { fields: input.outputFields };
  const fieldMapping = { mappings: input.fieldMappings };
  return {
    id: input.id,
    userId: input.userId,
    name: input.name,
    eventType: input.eventType,
    type: "ai",
    enabled: input.enabled,
    config: {
      providerId: input.providerId,
      model: input.model,
      template: input.template,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      outputFields: input.outputFields,
      fieldMappings: input.fieldMappings,
      writeBehavior: input.writeBehavior,
      downstreamEventBehavior: input.downstreamEventBehavior,
    },
    outputSchema,
    fieldMapping,
    writeBehavior: input.writeBehavior,
    downstreamEventBehavior: input.downstreamEventBehavior,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function toSafeAiProvider(record: AiProviderEncryptedRecord): AiProviderSafeRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    type: record.type,
    baseUrl: record.baseUrl,
    defaultModel: record.defaultModel,
    enabled: record.enabled,
    hasApiKey: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
