import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  user,
} from "./auth";

import {
  EXCHANGE_TYPE_VALUES,
  LEAD_STAGE_VALUES,
  PROJECT_STATUS_VALUES,
  TICKET_PRIORITY_VALUES,
  TICKET_STATUS_VALUES,
  TICKET_TYPE_VALUES,
} from "@DCRM/domain";

/**
 * Narrows a readonly string array to a non-empty tuple for pgEnum,
 * which requires at least one value at the type level.
 */
function pgEnumValues<T extends string>(values: readonly T[]): [T, ...T[]] {
  return values as unknown as [T, ...T[]];
}

// --- Enums ---

export const leadStageEnum = pgEnum(
  "lead_stage",
  pgEnumValues(LEAD_STAGE_VALUES),
);

export const projectStatusEnum = pgEnum(
  "project_status",
  pgEnumValues(PROJECT_STATUS_VALUES),
);

export const ticketTypeEnum = pgEnum(
  "ticket_type",
  pgEnumValues(TICKET_TYPE_VALUES),
);

export const ticketStatusEnum = pgEnum(
  "ticket_status",
  pgEnumValues(TICKET_STATUS_VALUES),
);

export const ticketPriorityEnum = pgEnum(
  "ticket_priority",
  pgEnumValues(TICKET_PRIORITY_VALUES),
);

export const exchangeTypeEnum = pgEnum(
  "exchange_type",
  pgEnumValues(EXCHANGE_TYPE_VALUES),
);

export const exchangeDirectionEnum = pgEnum(
  "exchange_direction",
  ["incoming", "outgoing"],
);

// --- Tables ---

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
    socialLinks: jsonb("social_links").$type<Record<string, string>>(),
    address: jsonb("address").$type<Record<string, string>>(),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("clients_user_id_idx").on(table.userId),
    index("clients_deleted_at_idx").on(table.deletedAt),
    index("clients_email_idx").on(table.email),
  ],
);

export const leads = pgTable(
  "leads",
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
    source: text("source"),
    stage: leadStageEnum("stage").notNull().default("new"),
    estimatedValue: real("estimated_value"),
    currency: text("currency").default("USD"),
    socialLinks: jsonb("social_links").$type<Record<string, string>>(),
    address: jsonb("address").$type<Record<string, string>>(),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    convertedClientId: text("converted_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    convertedAt: timestamp("converted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("leads_user_id_idx").on(table.userId),
    index("leads_stage_idx").on(table.stage),
    index("leads_deleted_at_idx").on(table.deletedAt),
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
    status: projectStatusEnum("status").notNull().default("planning"),
    budgetAmount: real("budget_amount"),
    budgetCurrency: text("budget_currency").default("USD"),
    estimatedHours: real("estimated_hours"),
    actualHours: real("actual_hours"),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_client_id_idx").on(table.clientId),
    index("projects_status_idx").on(table.status),
    index("projects_deleted_at_idx").on(table.deletedAt),
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
    type: ticketTypeEnum("type").notNull().default("task"),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    dueDate: timestamp("due_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("tickets_user_id_idx").on(table.userId),
    index("tickets_project_id_idx").on(table.projectId),
    index("tickets_status_idx").on(table.status),
    index("tickets_deleted_at_idx").on(table.deletedAt),
  ],
);

export const exchanges = pgTable(
  "exchanges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: exchangeTypeEnum("type").notNull(),
    clientId: text("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    ticketId: text("ticket_id").references(() => tickets.id, {
      onDelete: "cascade",
    }),
    subject: text("subject"),
    body: text("body"),
    direction: exchangeDirectionEnum("direction").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("exchanges_user_id_idx").on(table.userId),
    index("exchanges_client_id_idx").on(table.clientId),
    index("exchanges_project_id_idx").on(table.projectId),
    index("exchanges_ticket_id_idx").on(table.ticketId),
    index("exchanges_type_idx").on(table.type),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tags_user_id_idx").on(table.userId),
    uniqueIndex("tags_user_id_name_idx").on(table.userId, table.name),
  ],
);

export const entityTags = pgTable(
  "entity_tags",
  {
    id: text("id").primaryKey(),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("entity_tags_tag_id_idx").on(table.tagId),
    index("entity_tags_entity_idx").on(table.entityType, table.entityId),
    uniqueIndex("entity_tags_unique_idx").on(
      table.tagId,
      table.entityType,
      table.entityId,
    ),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    filePath: text("file_path").notNull(),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("attachments_user_id_idx").on(table.userId),
    index("attachments_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    locale: text("locale").default("en"),
    theme: text("theme").default("system"),
    onboardingCompleted: boolean("onboarding_completed")
      .notNull()
      .default(false),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

// --- Relations ---

export const clientsRelations = relations(clients, ({ one, many }) => ({
  user: one(user, {
    fields: [clients.userId],
    references: [user.id],
  }),
  projects: many(projects),
  exchanges: many(exchanges),
  tags: many(entityTags),
  attachments: many(attachments),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  user: one(user, {
    fields: [leads.userId],
    references: [user.id],
  }),
  convertedClient: one(clients, {
    fields: [leads.convertedClientId],
    references: [clients.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  tickets: many(tickets),
  exchanges: many(exchanges),
  tags: many(entityTags),
  attachments: many(attachments),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  user: one(user, {
    fields: [tickets.userId],
    references: [user.id],
  }),
  project: one(projects, {
    fields: [tickets.projectId],
    references: [projects.id],
  }),
  exchanges: many(exchanges),
  tags: many(entityTags),
  attachments: many(attachments),
}));

export const exchangesRelations = relations(exchanges, ({ one }) => ({
  user: one(user, {
    fields: [exchanges.userId],
    references: [user.id],
  }),
  client: one(clients, {
    fields: [exchanges.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [exchanges.projectId],
    references: [projects.id],
  }),
  ticket: one(tickets, {
    fields: [exchanges.ticketId],
    references: [tickets.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(user, {
    fields: [tags.userId],
    references: [user.id],
  }),
  entityTags: many(entityTags),
}));

export const entityTagsRelations = relations(entityTags, ({ one }) => ({
  tag: one(tags, {
    fields: [entityTags.tagId],
    references: [tags.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
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
