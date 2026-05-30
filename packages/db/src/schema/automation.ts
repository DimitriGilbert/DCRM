import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

import {
  EVENT_SOURCE_VALUES,
  HOOK_TYPE_VALUES,
  HOOK_WRITE_BEHAVIOR_VALUES,
  HOOK_EXECUTION_STATUS_VALUES,
  INCOMING_WEBHOOK_MODE_VALUES,
  AI_PROVIDER_VALUES,
  BILLING_STATUS_VALUES,
} from "@DCRM/domain";

/**
 * Narrows a readonly string array to a non-empty tuple for pgEnum,
 * which requires at least one value at the type level.
 */
function pgEnumValues<T extends string>(values: readonly T[]): [T, ...T[]] {
  return values as unknown as [T, ...T[]];
}

// --- Event changes shape stored in JSONB ---

export interface EventChanges {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// --- Enums ---

export const eventSourceEnum = pgEnum(
  "event_source",
  pgEnumValues(EVENT_SOURCE_VALUES),
);

export const hookTypeEnum = pgEnum(
  "hook_type",
  pgEnumValues(HOOK_TYPE_VALUES),
);

export const hookWriteBehaviorEnum = pgEnum(
  "hook_write_behavior",
  pgEnumValues(HOOK_WRITE_BEHAVIOR_VALUES),
);

export const hookExecutionStatusEnum = pgEnum(
  "hook_execution_status",
  pgEnumValues(HOOK_EXECUTION_STATUS_VALUES),
);

export const incomingWebhookModeEnum = pgEnum(
  "incoming_webhook_mode",
  pgEnumValues(INCOMING_WEBHOOK_MODE_VALUES),
);

export const aiProviderEnum = pgEnum(
  "ai_provider",
  pgEnumValues(AI_PROVIDER_VALUES),
);

export const aiChatRoleEnum = pgEnum("ai_chat_role", [
  "user",
  "assistant",
  "system",
]);

export const billingStatusEnum = pgEnum(
  "billing_status",
  pgEnumValues(BILLING_STATUS_VALUES),
);

// --- Tables ---

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
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    changes: jsonb("changes").$type<EventChanges>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("events_user_id_idx").on(table.userId),
    index("events_type_idx").on(table.type),
    index("events_entity_idx").on(table.entityType, table.entityId),
    index("events_created_at_idx").on(table.createdAt),
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
    type: hookTypeEnum("type").notNull(),
    eventType: text("event_type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>(),
    fieldMapping: jsonb("field_mapping").$type<Record<string, unknown>>(),
    writeBehavior: hookWriteBehaviorEnum("write_behavior")
      .notNull()
      .default("propose_first"),
    emitDownstreamEvents: boolean("emit_downstream_events")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
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
    status: hookExecutionStatusEnum("status").notNull().default("pending"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
    urlToken: text("url_token").notNull(),
    secret: text("secret"),
    mode: incomingWebhookModeEnum("mode").notNull().default("test"),
    mappingConfig: jsonb("mapping_config").$type<Record<string, unknown>>(),
    enabled: boolean("enabled").notNull().default(true),
    lastReceivedAt: timestamp("last_received_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("incoming_webhooks_user_id_idx").on(table.userId),
    uniqueIndex("incoming_webhooks_url_token_idx").on(table.urlToken),
  ],
);

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: aiProviderEnum("provider").notNull(),
    name: text("name").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    baseUrl: text("base_url"),
    config: jsonb("config").$type<Record<string, unknown>>(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_providers_user_id_idx").on(table.userId),
    index("ai_providers_provider_idx").on(table.provider),
  ],
);

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hookExecutionId: text("hook_execution_id").references(
      () => hookExecutions.id,
      { onDelete: "set null" },
    ),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    prompt: text("prompt").notNull(),
    structuredOutput: jsonb("structured_output").$type<Record<string, unknown>>(),
    fieldMappingResult: jsonb("field_mapping_result").$type<Record<string, unknown>>(),
    applied: boolean("applied").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_insights_user_id_idx").on(table.userId),
    index("ai_insights_hook_execution_id_idx").on(table.hookExecutionId),
    index("ai_insights_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: aiChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").$type<Record<string, unknown>[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_chat_messages_user_id_idx").on(table.userId),
    index("ai_chat_messages_created_at_idx").on(table.createdAt),
  ],
);

export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    encryptedImapHost: text("encrypted_imap_host").notNull(),
    encryptedImapPort: text("encrypted_imap_port").notNull(),
    encryptedImapUser: text("encrypted_imap_user").notNull(),
    encryptedImapPassword: text("encrypted_imap_password").notNull(),
    encryptedSmtpHost: text("encrypted_smtp_host").notNull(),
    encryptedSmtpPort: text("encrypted_smtp_port").notNull(),
    encryptedSmtpUser: text("encrypted_smtp_user").notNull(),
    encryptedSmtpPassword: text("encrypted_smtp_password").notNull(),
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    syncInterval: integer("sync_interval").notNull().default(15),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("email_accounts_user_id_idx").on(table.userId),
    uniqueIndex("email_accounts_user_email_idx").on(table.userId, table.email),
  ],
);

export const emailSyncState = pgTable(
  "email_sync_state",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emailAccountId: text("email_account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    folder: text("folder").notNull(),
    lastUid: text("last_uid"),
    uidValidity: text("uid_validity"),
    lastSyncAt: timestamp("last_sync_at").notNull(),
  },
  (table) => [
    index("email_sync_state_user_id_idx").on(table.userId),
    index("email_sync_state_email_account_id_idx").on(table.emailAccountId),
    uniqueIndex("email_sync_state_account_folder_idx").on(table.emailAccountId, table.folder),
  ],
);

export const unmatchedEmails = pgTable(
  "unmatched_emails",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    body: text("body"),
    headers: jsonb("headers").$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at").notNull(),
    linkedEntityType: text("linked_entity_type"),
    linkedEntityId: text("linked_entity_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("unmatched_emails_user_id_idx").on(table.userId),
    index("unmatched_emails_received_at_idx").on(table.receivedAt),
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
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    uniqueIndex("api_keys_key_hash_idx").on(table.keyHash),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: billingStatusEnum("status").notNull().default("inactive"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_status_idx").on(table.status),
    uniqueIndex("subscriptions_stripe_sub_id_idx").on(table.stripeSubscriptionId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_read_idx").on(table.read),
    index("notifications_created_at_idx").on(table.createdAt),
  ],
);

// --- Relations ---

export const eventsRelations = relations(events, ({ one }) => ({
  user: one(user, {
    fields: [events.userId],
    references: [user.id],
  }),
}));

export const hooksRelations = relations(hooks, ({ one, many }) => ({
  user: one(user, {
    fields: [hooks.userId],
    references: [user.id],
  }),
  executions: many(hookExecutions),
}));

export const hookExecutionsRelations = relations(hookExecutions, ({ one }) => ({
  user: one(user, {
    fields: [hookExecutions.userId],
    references: [user.id],
  }),
  hook: one(hooks, {
    fields: [hookExecutions.hookId],
    references: [hooks.id],
  }),
  event: one(events, {
    fields: [hookExecutions.eventId],
    references: [events.id],
  }),
}));

export const incomingWebhooksRelations = relations(incomingWebhooks, ({ one }) => ({
  user: one(user, {
    fields: [incomingWebhooks.userId],
    references: [user.id],
  }),
}));

export const aiProvidersRelations = relations(aiProviders, ({ one }) => ({
  user: one(user, {
    fields: [aiProviders.userId],
    references: [user.id],
  }),
}));

export const aiInsightsRelations = relations(aiInsights, ({ one }) => ({
  user: one(user, {
    fields: [aiInsights.userId],
    references: [user.id],
  }),
  hookExecution: one(hookExecutions, {
    fields: [aiInsights.hookExecutionId],
    references: [hookExecutions.id],
  }),
}));

export const aiChatMessagesRelations = relations(aiChatMessages, ({ one }) => ({
  user: one(user, {
    fields: [aiChatMessages.userId],
    references: [user.id],
  }),
}));

export const emailAccountsRelations = relations(emailAccounts, ({ one, many }) => ({
  user: one(user, {
    fields: [emailAccounts.userId],
    references: [user.id],
  }),
  syncStates: many(emailSyncState),
}));

export const emailSyncStateRelations = relations(emailSyncState, ({ one }) => ({
  user: one(user, {
    fields: [emailSyncState.userId],
    references: [user.id],
  }),
  emailAccount: one(emailAccounts, {
    fields: [emailSyncState.emailAccountId],
    references: [emailAccounts.id],
  }),
}));

export const unmatchedEmailsRelations = relations(unmatchedEmails, ({ one }) => ({
  user: one(user, {
    fields: [unmatchedEmails.userId],
    references: [user.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(user, {
    fields: [apiKeys.userId],
    references: [user.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(user, {
    fields: [subscriptions.userId],
    references: [user.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, {
    fields: [notifications.userId],
    references: [user.id],
  }),
}));
