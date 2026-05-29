import {
  ATTACHMENT_STORAGE_BACKENDS,
  ATTACHMENT_TARGET_TYPES,
  EXCHANGE_TYPES,
  EXCHANGE_VISIBILITIES,
  LEAD_STAGES,
  PROJECT_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  USER_THEME_PREFERENCES,
} from "@DCRM/domain";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";

type JsonObject = Record<string, unknown>;

export const leadStageEnum = pgEnum("lead_stage", LEAD_STAGES);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const ticketTypeEnum = pgEnum("ticket_type", TICKET_TYPES);
export const ticketStatusEnum = pgEnum("ticket_status", TICKET_STATUSES);
export const ticketPriorityEnum = pgEnum("ticket_priority", TICKET_PRIORITIES);
export const exchangeTypeEnum = pgEnum("exchange_type", EXCHANGE_TYPES);
export const exchangeVisibilityEnum = pgEnum("exchange_visibility", EXCHANGE_VISIBILITIES);
export const attachmentTargetTypeEnum = pgEnum("attachment_target_type", ATTACHMENT_TARGET_TYPES);
export const attachmentStorageBackendEnum = pgEnum("attachment_storage_backend", ATTACHMENT_STORAGE_BACKENDS);
export const userThemePreferenceEnum = pgEnum("user_theme_preference", USER_THEME_PREFERENCES);

export const clients = pgTable(
  "clients",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    website: text("website"),
    notes: text("notes"),
    socialLinks: jsonb("social_links").$type<JsonObject>().default({}).notNull(),
    address: jsonb("address").$type<JsonObject>().default({}).notNull(),
    customFields: jsonb("custom_fields").$type<JsonObject>().default({}).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("clients_user_id_idx").on(table.userId),
    index("clients_name_idx").on(table.name),
    index("clients_email_idx").on(table.email),
    index("clients_company_idx").on(table.company),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    convertedClientId: text("converted_client_id").references(() => clients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    website: text("website"),
    notes: text("notes"),
    source: text("source"),
    stage: leadStageEnum("stage").default("new").notNull(),
    estimatedValueAmount: numeric("estimated_value_amount", { precision: 12, scale: 2 }),
    estimatedValueCurrency: text("estimated_value_currency"),
    socialLinks: jsonb("social_links").$type<JsonObject>().default({}).notNull(),
    address: jsonb("address").$type<JsonObject>().default({}).notNull(),
    customFields: jsonb("custom_fields").$type<JsonObject>().default({}).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    convertedAt: timestamp("converted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("leads_user_id_idx").on(table.userId),
    index("leads_stage_idx").on(table.stage),
    index("leads_converted_client_id_idx").on(table.convertedClientId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").default("planning").notNull(),
    budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }),
    budgetCurrency: text("budget_currency"),
    estimatedHours: numeric("estimated_hours", { precision: 10, scale: 2 }),
    actualHours: numeric("actual_hours", { precision: 10, scale: 2 }),
    startsAt: timestamp("starts_at"),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    customFields: jsonb("custom_fields").$type<JsonObject>().default({}).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_client_id_idx").on(table.clientId),
    index("projects_status_idx").on(table.status),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    type: ticketTypeEnum("type").default("task").notNull(),
    status: ticketStatusEnum("status").default("open").notNull(),
    priority: ticketPriorityEnum("priority").default("normal").notNull(),
    dueAt: timestamp("due_at"),
    closedAt: timestamp("closed_at"),
    customFields: jsonb("custom_fields").$type<JsonObject>().default({}).notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("tickets_user_id_idx").on(table.userId),
    index("tickets_project_id_idx").on(table.projectId),
    index("tickets_status_idx").on(table.status),
    index("tickets_priority_idx").on(table.priority),
  ],
);

export const exchanges = pgTable(
  "exchanges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
    type: exchangeTypeEnum("type").notNull(),
    visibility: exchangeVisibilityEnum("visibility").default("internal").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    externalMessageId: text("external_message_id"),
    threadId: text("thread_id"),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("exchanges_user_id_idx").on(table.userId),
    index("exchanges_client_id_idx").on(table.clientId),
    index("exchanges_project_id_idx").on(table.projectId),
    index("exchanges_ticket_id_idx").on(table.ticketId),
    index("exchanges_type_idx").on(table.type),
  ],
);

export const exchangeParticipants = pgTable(
  "exchange_participants",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    exchangeId: text("exchange_id")
      .notNull()
      .references(() => exchanges.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email").notNull(),
    role: text("role").notNull(),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("exchange_participants_user_id_idx").on(table.userId),
    index("exchange_participants_exchange_id_idx").on(table.exchangeId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("tags_user_id_idx").on(table.userId), uniqueIndex("tags_user_id_name_idx").on(table.userId, table.name)],
);

export const entityTags = pgTable(
  "entity_tags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: attachmentTargetTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tagId, table.entityType, table.entityId] }),
    index("entity_tags_user_id_idx").on(table.userId),
    index("entity_tags_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: attachmentTargetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    storageBackend: attachmentStorageBackendEnum("storage_backend").default("local").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type"),
    byteSize: integer("byte_size").notNull(),
    checksum: text("checksum"),
    metadata: jsonb("metadata").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("attachments_user_id_idx").on(table.userId),
    index("attachments_target_idx").on(table.targetType, table.targetId),
  ],
);

export const userSettings = pgTable(
  "user_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    locale: text("locale").default("en").notNull(),
    theme: userThemePreferenceEnum("theme").default("system").notNull(),
    onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
    preferences: jsonb("preferences").$type<JsonObject>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("user_settings_user_id_idx").on(table.userId)],
);

export const coreCrmTables = [
  clients,
  leads,
  projects,
  tickets,
  exchanges,
  exchangeParticipants,
  tags,
  entityTags,
  attachments,
  userSettings,
] as const;

export const clientRelations = relations(clients, ({ many, one }) => ({
  exchanges: many(exchanges),
  leadsConvertedToClient: many(leads),
  projects: many(projects),
  user: one(user, {
    fields: [clients.userId],
    references: [user.id],
  }),
}));

export const leadRelations = relations(leads, ({ one }) => ({
  convertedClient: one(clients, {
    fields: [leads.convertedClientId],
    references: [clients.id],
  }),
  user: one(user, {
    fields: [leads.userId],
    references: [user.id],
  }),
}));

export const projectRelations = relations(projects, ({ many, one }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  exchanges: many(exchanges),
  tickets: many(tickets),
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
}));

export const ticketRelations = relations(tickets, ({ many, one }) => ({
  exchanges: many(exchanges),
  project: one(projects, {
    fields: [tickets.projectId],
    references: [projects.id],
  }),
  user: one(user, {
    fields: [tickets.userId],
    references: [user.id],
  }),
}));

export const exchangeRelations = relations(exchanges, ({ many, one }) => ({
  client: one(clients, {
    fields: [exchanges.clientId],
    references: [clients.id],
  }),
  participants: many(exchangeParticipants),
  project: one(projects, {
    fields: [exchanges.projectId],
    references: [projects.id],
  }),
  ticket: one(tickets, {
    fields: [exchanges.ticketId],
    references: [tickets.id],
  }),
  user: one(user, {
    fields: [exchanges.userId],
    references: [user.id],
  }),
}));

export const exchangeParticipantRelations = relations(exchangeParticipants, ({ one }) => ({
  exchange: one(exchanges, {
    fields: [exchangeParticipants.exchangeId],
    references: [exchanges.id],
  }),
  user: one(user, {
    fields: [exchangeParticipants.userId],
    references: [user.id],
  }),
}));

export const tagRelations = relations(tags, ({ many, one }) => ({
  entityTags: many(entityTags),
  user: one(user, {
    fields: [tags.userId],
    references: [user.id],
  }),
}));

export const entityTagRelations = relations(entityTags, ({ one }) => ({
  tag: one(tags, {
    fields: [entityTags.tagId],
    references: [tags.id],
  }),
  user: one(user, {
    fields: [entityTags.userId],
    references: [user.id],
  }),
}));

export const attachmentRelations = relations(attachments, ({ one }) => ({
  user: one(user, {
    fields: [attachments.userId],
    references: [user.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(user, {
    fields: [userSettings.userId],
    references: [user.id],
  }),
}));
