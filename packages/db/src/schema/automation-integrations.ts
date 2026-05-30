import {
  AI_PROVIDER_TYPES,
  DOWNSTREAM_EVENT_BEHAVIORS,
  EVENT_SOURCES,
  HOOK_EXECUTION_STATUSES,
  HOOK_TYPES,
  HOOK_WRITE_BEHAVIORS,
  SUBSCRIPTION_STATUSES,
  WEBHOOK_AUTH_TYPES,
  WEBHOOK_MODES,
} from "@DCRM/domain";
import type { EncryptedSecretV1 } from "@DCRM/crypto";
import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth.js";

type JsonObject = Record<string, unknown>;

export type EncryptedValue = EncryptedSecretV1;

export const eventSourceEnum = pgEnum("event_source", EVENT_SOURCES);
export const hookTypeEnum = pgEnum("hook_type", HOOK_TYPES);
export const hookExecutionStatusEnum = pgEnum("hook_execution_status", HOOK_EXECUTION_STATUSES);
export const hookWriteBehaviorEnum = pgEnum("hook_write_behavior", HOOK_WRITE_BEHAVIORS);
export const downstreamEventBehaviorEnum = pgEnum("downstream_event_behavior", DOWNSTREAM_EVENT_BEHAVIORS);
export const webhookModeEnum = pgEnum("webhook_mode", WEBHOOK_MODES);
export const webhookAuthTypeEnum = pgEnum("webhook_auth_type", WEBHOOK_AUTH_TYPES);
export const aiProviderTypeEnum = pgEnum("ai_provider_type", AI_PROVIDER_TYPES);
export const subscriptionStatusEnum = pgEnum("subscription_status", SUBSCRIPTION_STATUSES);

export const eventDefinitions = pgTable(
  "event_definitions",
  {
    type: text("type").primaryKey(),
    entityType: text("entity_type"),
    action: text("action").notNull(),
    payloadSchema: jsonb("payload_schema").$type<JsonObject>().default({}).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("event_definitions_entity_type_idx").on(table.entityType)],
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    source: eventSourceEnum("source").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payload: jsonb("payload").$type<JsonObject>().default({}).notNull(),
    changes: jsonb("changes").$type<JsonObject>(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("events_user_id_idx").on(table.userId),
    index("events_type_idx").on(table.type),
    index("events_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const hooks = pgTable(
  "hooks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    eventType: text("event_type").notNull(),
    type: hookTypeEnum("type").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    config: jsonb("config").$type<JsonObject>().default({}).notNull(),
    outputSchema: jsonb("output_schema").$type<JsonObject>().default({}).notNull(),
    fieldMapping: jsonb("field_mapping").$type<JsonObject>().default({}).notNull(),
    writeBehavior: hookWriteBehaviorEnum("write_behavior").default("propose").notNull(),
    downstreamEventBehavior: downstreamEventBehaviorEnum("downstream_event_behavior").default("suppress").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("hooks_user_id_idx").on(table.userId),
    index("hooks_event_type_idx").on(table.eventType),
    index("hooks_enabled_idx").on(table.enabled),
  ],
);

export const hookExecutions = pgTable(
  "hook_executions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hookId: text("hook_id")
      .notNull()
      .references(() => hooks.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    status: hookExecutionStatusEnum("status").default("pending").notNull(),
    input: jsonb("input").$type<JsonObject>().default({}).notNull(),
    output: jsonb("output").$type<JsonObject>(),
    error: jsonb("error").$type<JsonObject>(),
    attempt: integer("attempt").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(1).notNull(),
    retryMetadata: jsonb("retry_metadata").$type<JsonObject>().default({}).notNull(),
    queuedAt: timestamp("queued_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    nextRetryAt: timestamp("next_retry_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("hook_executions_user_id_idx").on(table.userId),
    index("hook_executions_hook_id_idx").on(table.hookId),
    index("hook_executions_event_id_idx").on(table.eventId),
    index("hook_executions_status_idx").on(table.status),
  ],
);

export const incomingWebhooks = pgTable(
  "incoming_webhooks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    mode: webhookModeEnum("mode").default("test").notNull(),
    tokenHash: text("token_hash"),
    encryptedSecret: jsonb("encrypted_secret").$type<EncryptedValue>(),
    mappingConfig: jsonb("mapping_config").$type<JsonObject>().default({}).notNull(),
    targetEventType: text("target_event_type").notNull(),
    lastTestPayload: jsonb("last_test_payload").$type<JsonObject>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("incoming_webhooks_user_id_idx").on(table.userId),
    uniqueIndex("incoming_webhooks_slug_idx").on(table.slug),
    index("incoming_webhooks_mode_idx").on(table.mode),
  ],
);

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: aiProviderTypeEnum("type").notNull(),
    encryptedApiKey: jsonb("encrypted_api_key").$type<EncryptedValue>().notNull(),
    baseUrl: text("base_url"),
    defaultModel: text("default_model"),
    enabled: boolean("enabled").default(true).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("ai_providers_user_id_idx").on(table.userId), index("ai_providers_type_idx").on(table.type)],
);

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    hookExecutionId: text("hook_execution_id").references(() => hookExecutions.id, { onDelete: "set null" }),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    structuredOutput: jsonb("structured_output").$type<JsonObject>().default({}).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("ai_insights_user_id_idx").on(table.userId), index("ai_insights_entity_idx").on(table.entityType, table.entityId)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").$type<JsonObject>().default({}).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("ai_messages_user_id_idx").on(table.userId), index("ai_messages_conversation_id_idx").on(table.conversationId)],
);

export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emailAddress: text("email_address").notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull(),
    imapUsername: text("imap_username").notNull(),
    encryptedImapPassword: jsonb("encrypted_imap_password").$type<EncryptedValue>().notNull(),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull(),
    smtpUsername: text("smtp_username").notNull(),
    encryptedSmtpPassword: jsonb("encrypted_smtp_password").$type<EncryptedValue>().notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("email_accounts_user_id_idx").on(table.userId), index("email_accounts_email_address_idx").on(table.emailAddress)],
);

export const emailSyncStates = pgTable(
  "email_sync_states",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emailAccountId: text("email_account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    mailbox: text("mailbox").notNull(),
    lastUid: text("last_uid"),
    syncCursor: text("sync_cursor"),
    lastSyncedAt: timestamp("last_synced_at"),
    status: text("status").default("idle").notNull(),
    error: jsonb("error").$type<JsonObject>(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("email_sync_states_user_id_idx").on(table.userId),
    uniqueIndex("email_sync_states_account_mailbox_idx").on(table.emailAccountId, table.mailbox),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    uniqueIndex("api_keys_key_hash_idx").on(table.keyHash),
    index("api_keys_key_prefix_idx").on(table.keyPrefix),
  ],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: subscriptionStatusEnum("status").default("inactive").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("billing_subscriptions_user_id_idx").on(table.userId),
    uniqueIndex("billing_subscriptions_stripe_customer_id_idx").on(table.stripeCustomerId),
    uniqueIndex("billing_subscriptions_stripe_subscription_id_idx").on(table.stripeSubscriptionId),
  ],
);

export const automationIntegrationTables = [
  eventDefinitions,
  events,
  hooks,
  hookExecutions,
  incomingWebhooks,
  aiProviders,
  aiInsights,
  aiMessages,
  emailAccounts,
  emailSyncStates,
  apiKeys,
  billingSubscriptions,
] as const;

export const automationIntegrationTableNames = [
  "event_definitions",
  "events",
  "hooks",
  "hook_executions",
  "incoming_webhooks",
  "ai_providers",
  "ai_insights",
  "ai_messages",
  "email_accounts",
  "email_sync_states",
  "api_keys",
  "billing_subscriptions",
] as const;

export const eventRelations = relations(events, ({ many, one }) => ({
  hookExecutions: many(hookExecutions),
  user: one(user, {
    fields: [events.userId],
    references: [user.id],
  }),
}));

export const hookRelations = relations(hooks, ({ many, one }) => ({
  executions: many(hookExecutions),
  user: one(user, {
    fields: [hooks.userId],
    references: [user.id],
  }),
}));

export const hookExecutionRelations = relations(hookExecutions, ({ many, one }) => ({
  aiInsights: many(aiInsights),
  event: one(events, {
    fields: [hookExecutions.eventId],
    references: [events.id],
  }),
  hook: one(hooks, {
    fields: [hookExecutions.hookId],
    references: [hooks.id],
  }),
  user: one(user, {
    fields: [hookExecutions.userId],
    references: [user.id],
  }),
}));

export const incomingWebhookRelations = relations(incomingWebhooks, ({ one }) => ({
  user: one(user, {
    fields: [incomingWebhooks.userId],
    references: [user.id],
  }),
}));

export const aiProviderRelations = relations(aiProviders, ({ many, one }) => ({
  insights: many(aiInsights),
  messages: many(aiMessages),
  user: one(user, {
    fields: [aiProviders.userId],
    references: [user.id],
  }),
}));

export const aiInsightRelations = relations(aiInsights, ({ one }) => ({
  hookExecution: one(hookExecutions, {
    fields: [aiInsights.hookExecutionId],
    references: [hookExecutions.id],
  }),
  provider: one(aiProviders, {
    fields: [aiInsights.providerId],
    references: [aiProviders.id],
  }),
  user: one(user, {
    fields: [aiInsights.userId],
    references: [user.id],
  }),
}));

export const aiMessageRelations = relations(aiMessages, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [aiMessages.providerId],
    references: [aiProviders.id],
  }),
  user: one(user, {
    fields: [aiMessages.userId],
    references: [user.id],
  }),
}));

export const emailAccountRelations = relations(emailAccounts, ({ many, one }) => ({
  syncStates: many(emailSyncStates),
  user: one(user, {
    fields: [emailAccounts.userId],
    references: [user.id],
  }),
}));

export const emailSyncStateRelations = relations(emailSyncStates, ({ one }) => ({
  emailAccount: one(emailAccounts, {
    fields: [emailSyncStates.emailAccountId],
    references: [emailAccounts.id],
  }),
  user: one(user, {
    fields: [emailSyncStates.userId],
    references: [user.id],
  }),
}));

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
  user: one(user, {
    fields: [apiKeys.userId],
    references: [user.id],
  }),
}));

export const billingSubscriptionRelations = relations(billingSubscriptions, ({ one }) => ({
  user: one(user, {
    fields: [billingSubscriptions.userId],
    references: [user.id],
  }),
}));
