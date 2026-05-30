import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";
import type { AiHookTemplate, AiProviderType, DownstreamEventBehavior, HookExecutionStatus, HookWriteBehavior, WebhookAuthType, WebhookMode } from "@DCRM/domain";
import { isCoreEventType } from "@DCRM/events";
import type { CoreEventType } from "@DCRM/events";
import type { HookSubscription } from "@DCRM/events/hooks";

import { assertNoSecretBearingOutgoingWebhookHeaders, assertOutgoingWebhookSecretsUseHttps, parseSafeOutgoingWebhookUrl } from "./outgoing-webhook-url.js";

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
    readonly createOutgoingWebhookHook: (input: CreateOutgoingWebhookHookInput) => Promise<OutgoingWebhookHookSafeRecord>;
    readonly listAiHooks: (input: { readonly userId: string }) => Promise<readonly AiHookConfigRecord[]>;
    readonly listOutgoingWebhookHooks: (input: { readonly userId: string }) => Promise<readonly OutgoingWebhookHookSafeRecord[]>;
    readonly listEnabledForEvent: (input: { readonly userId: string; readonly eventType: CoreEventType }) => Promise<readonly HookSubscription[]>;
    readonly getById: (hookId: string) => Promise<HookSubscription | undefined>;
  };
  readonly aiInsights: {
    readonly create: (input: CreateAiInsightInput) => Promise<AiInsightRecord>;
    readonly listForUser: (input: { readonly userId: string }) => Promise<readonly AiInsightRecord[]>;
  };
  readonly aiMessages: {
    readonly create: (input: CreateAiMessageInput) => Promise<AiMessageRecord>;
    readonly listConversation: (input: { readonly userId: string; readonly conversationId: string; readonly limit?: number }) => Promise<readonly AiMessageRecord[]>;
  };
  readonly incomingWebhooks: {
    readonly create: (input: CreateIncomingWebhookInput) => Promise<IncomingWebhookSafeRecord>;
    readonly listSafe: (input: { readonly userId: string }) => Promise<readonly IncomingWebhookSafeRecord[]>;
    readonly getBySlug: (slug: string) => Promise<IncomingWebhookStoredRecord | null>;
    readonly updateMode: (input: { readonly userId: string; readonly id: string; readonly mode: WebhookMode; readonly now: Date }) => Promise<IncomingWebhookSafeRecord>;
    readonly recordTestPayload: (input: { readonly id: string; readonly payload: JsonObject; readonly now: Date }) => Promise<void>;
  };
  readonly emailAccounts: {
    readonly listSafe: (input: { readonly userId: string }) => Promise<readonly EmailAccountSafeRecord[]>;
    readonly upsertEncrypted: (input: UpsertEmailAccountEncryptedInput) => Promise<EmailAccountSafeRecord>;
    readonly listEncrypted: (input: { readonly userId: string }) => Promise<readonly EmailAccountEncryptedRecord[]>;
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

export type OutgoingWebhookHookSafeRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly eventType: CoreEventType;
  readonly type: "outgoing_webhook";
  readonly enabled: boolean;
  readonly url: string;
  readonly authType: WebhookAuthType;
  readonly customHeaderNames: readonly string[];
  readonly retryPolicy: JsonObject | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateOutgoingWebhookHookInput = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly eventType: CoreEventType;
  readonly enabled: boolean;
  readonly url: string;
  readonly auth: JsonObject;
  readonly headers: JsonObject;
  readonly retryPolicy: JsonObject;
  readonly now: Date;
};

export type IncomingWebhookMappingConfig = JsonObject;

export type IncomingWebhookSafeRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly slug: string;
  readonly enabled: boolean;
  readonly mode: WebhookMode;
  readonly targetEventType: CoreEventType;
  readonly mappingConfig: IncomingWebhookMappingConfig;
  readonly hasToken: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type IncomingWebhookStoredRecord = IncomingWebhookSafeRecord & {
  readonly tokenHash: string | null;
  readonly lastTestPayload: JsonObject | null;
};

export type CreateIncomingWebhookInput = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly slug: string;
  readonly enabled: boolean;
  readonly mode: WebhookMode;
  readonly tokenHash: string | null;
  readonly mappingConfig: IncomingWebhookMappingConfig;
  readonly targetEventType: CoreEventType;
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

export type EmailAccountSafeRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly emailAddress: string;
  readonly imapHost: string;
  readonly imapPort: number;
  readonly imapUsername: string;
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly smtpUsername: string;
  readonly enabled: boolean;
  readonly hasImapPassword: boolean;
  readonly hasSmtpPassword: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type EmailAccountEncryptedRecord = EmailAccountSafeRecord & {
  readonly encryptedImapPassword: EncryptedSecretV1;
  readonly encryptedSmtpPassword: EncryptedSecretV1;
};

export type UpsertEmailAccountEncryptedInput = {
  readonly id?: string;
  readonly userId: string;
  readonly name: string;
  readonly emailAddress: string;
  readonly imapHost: string;
  readonly imapPort: number;
  readonly imapUsername: string;
  readonly encryptedImapPassword: EncryptedSecretV1;
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly smtpUsername: string;
  readonly encryptedSmtpPassword: EncryptedSecretV1;
  readonly enabled: boolean;
  readonly now: Date;
};

export function createInMemoryAutomationRepository(records: readonly HookExecutionStatusRecord[] = []) {
  const hookExecutionRecords = [...records];
  const aiProviderRecords: AiProviderEncryptedRecord[] = [];
  const hookRecords: HookSubscription[] = [];
  const insightRecords: AiInsightRecord[] = [];
  const messageRecords: AiMessageRecord[] = [];
  const incomingWebhookRecords: IncomingWebhookStoredRecord[] = [];
  const emailAccountRecords: EmailAccountEncryptedRecord[] = [];
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
        return record?.enabled ? { ...toSafeAiProvider(record), apiKey: input.crypto.decrypt(record.encryptedApiKey) } : null;
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
      async createOutgoingWebhookHook(input) {
        const record = createOutgoingWebhookHookRecord(input);
        hookRecords.push(record);
        return toSafeOutgoingWebhookHook(record);
      },
      async listAiHooks(input) {
        return hookRecords.filter((record): record is AiHookConfigRecord => record.userId === input.userId && record.type === "ai");
      },
      async listOutgoingWebhookHooks(input) {
        return hookRecords.filter((record) => record.userId === input.userId && record.type === "outgoing_webhook").map(toSafeOutgoingWebhookHook);
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
    incomingWebhooks: {
      async create(input) {
        const record: IncomingWebhookStoredRecord = { ...input, hasToken: input.tokenHash !== null, lastTestPayload: null, createdAt: input.now, updatedAt: input.now };
        incomingWebhookRecords.push(record);
        return toSafeIncomingWebhook(record);
      },
      async listSafe(input) {
        return incomingWebhookRecords.filter((record) => record.userId === input.userId).map(toSafeIncomingWebhook);
      },
      async getBySlug(slug) {
        return incomingWebhookRecords.find((record) => record.slug === slug) ?? null;
      },
      async updateMode(input) {
        const record = incomingWebhookRecords.find((candidate) => candidate.id === input.id && candidate.userId === input.userId);
        if (!record) {
          throw new Error("Incoming webhook was not found.");
        }
        const updated: IncomingWebhookStoredRecord = { ...record, mode: input.mode, updatedAt: input.now };
        incomingWebhookRecords[incomingWebhookRecords.indexOf(record)] = updated;
        return toSafeIncomingWebhook(updated);
      },
      async recordTestPayload(input) {
        const record = incomingWebhookRecords.find((candidate) => candidate.id === input.id);
        if (record) {
          incomingWebhookRecords[incomingWebhookRecords.indexOf(record)] = { ...record, lastTestPayload: input.payload, updatedAt: input.now };
        }
      },
    },
    emailAccounts: {
      async listSafe(input) {
        return emailAccountRecords.filter((record) => record.userId === input.userId).map(toSafeEmailAccount);
      },
      async upsertEncrypted(input) {
        const existingIndex = input.id ? emailAccountRecords.findIndex((record) => record.id === input.id && record.userId === input.userId) : -1;
        const existing = existingIndex >= 0 ? emailAccountRecords[existingIndex] : undefined;
        if (input.id && !existing) {
          throw new Error("Email account was not found.");
        }
        const record: EmailAccountEncryptedRecord = {
          id: input.id ?? crypto.randomUUID(),
          userId: input.userId,
          name: input.name,
          emailAddress: input.emailAddress,
          imapHost: input.imapHost,
          imapPort: input.imapPort,
          imapUsername: input.imapUsername,
          encryptedImapPassword: input.encryptedImapPassword,
          smtpHost: input.smtpHost,
          smtpPort: input.smtpPort,
          smtpUsername: input.smtpUsername,
          encryptedSmtpPassword: input.encryptedSmtpPassword,
          enabled: input.enabled,
          hasImapPassword: true,
          hasSmtpPassword: true,
          createdAt: existing?.createdAt ?? input.now,
          updatedAt: input.now,
        };
        if (existingIndex >= 0) {
          emailAccountRecords[existingIndex] = record;
        } else {
          emailAccountRecords.push(record);
        }
        return toSafeEmailAccount(record);
      },
      async listEncrypted(input) {
        return emailAccountRecords.filter((record) => record.userId === input.userId);
      },
    },
  } satisfies AutomationRepository;
}

function toSafeIncomingWebhook(record: IncomingWebhookStoredRecord): IncomingWebhookSafeRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    slug: record.slug,
    enabled: record.enabled,
    mode: record.mode,
    targetEventType: record.targetEventType,
    mappingConfig: record.mappingConfig,
    hasToken: record.tokenHash !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
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

function createOutgoingWebhookHookRecord(input: CreateOutgoingWebhookHookInput): HookSubscription & { readonly createdAt: Date; readonly updatedAt: Date } {
  assertSafeOutgoingWebhookSecretConfiguration(input);
  return {
    id: input.id,
    userId: input.userId,
    name: input.name,
    eventType: input.eventType,
    type: "outgoing_webhook",
    enabled: input.enabled,
    config: {
      url: input.url,
      auth: input.auth,
      headers: input.headers,
      retryPolicy: input.retryPolicy,
    },
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function assertSafeOutgoingWebhookSecretConfiguration(input: CreateOutgoingWebhookHookInput): void {
  const url = parseSafeOutgoingWebhookUrl(input.url);
  assertOutgoingWebhookSecretsUseHttps({ url, auth: input.auth, headers: input.headers });
  assertNoSecretBearingOutgoingWebhookHeaders(input.headers);
}

function toSafeOutgoingWebhookHook(record: HookSubscription): OutgoingWebhookHookSafeRecord {
  const auth = isJsonObject(record.config.auth) ? record.config.auth : { type: "none" };
  const authType = isWebhookAuthType(auth.type) ? auth.type : "none";
  const customHeaderNames = authType === "custom_headers" && Array.isArray(auth.headers)
    ? auth.headers.map((header) => (isJsonObject(header) && typeof header.name === "string" ? header.name : "")).filter((name) => name.length > 0)
    : [];
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    eventType: record.eventType,
    type: "outgoing_webhook",
    enabled: record.enabled,
    url: safeOutgoingWebhookListUrl(record.config.url),
    authType,
    customHeaderNames,
    retryPolicy: isJsonObject(record.config.retryPolicy) ? record.config.retryPolicy : null,
    createdAt: hasDateTimestamps(record) ? record.createdAt : new Date(0),
    updatedAt: hasDateTimestamps(record) ? record.updatedAt : new Date(0),
  };
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

function toSafeEmailAccount(record: EmailAccountEncryptedRecord): EmailAccountSafeRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    emailAddress: record.emailAddress,
    imapHost: record.imapHost,
    imapPort: record.imapPort,
    imapUsername: record.imapUsername,
    smtpHost: record.smtpHost,
    smtpPort: record.smtpPort,
    smtpUsername: record.smtpUsername,
    enabled: record.enabled,
    hasImapPassword: true,
    hasSmtpPassword: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebhookAuthType(value: unknown): value is WebhookAuthType {
  return value === "none" || value === "bearer" || value === "basic" || value === "hmac" || value === "custom_headers";
}

function hasDateTimestamps(record: HookSubscription): record is HookSubscription & { readonly createdAt: Date; readonly updatedAt: Date } {
  return "createdAt" in record && record.createdAt instanceof Date && "updatedAt" in record && record.updatedAt instanceof Date;
}
