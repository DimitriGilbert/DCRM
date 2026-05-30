import { createDb } from "@DCRM/db";
import { emailAccounts } from "@DCRM/db/schema/automation-integrations";
import { attachments, clientAuthorizedEmails, clients, entityTags, exchanges, leads, notifications, projects, tags, tickets, userSettings } from "@DCRM/db/schema/core-crm";
import { resolveLocale } from "@DCRM/i18n";
import type { AttachmentTargetType } from "@DCRM/domain";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, sum } from "drizzle-orm";

import { DuplicateTagNameError } from "./repository.js";
import type { CrmRepository } from "./repository.js";
import type { AttachmentRecord, ClientAuthorizedEmailRecord, ClientRecord, EntityTagRecord, ExchangeRecord, LeadRecord, NotificationRecord, ProjectRecord, TagRecord, TicketRecord, UserSettingsRecord } from "./types.js";

type CrmDatabase = ReturnType<typeof createDb>;
const ATTACHMENT_QUOTA_LOCK_NAMESPACE = 22_003;

export function createDrizzleCrmRepository(database: CrmDatabase = createDb()): CrmRepository {
  return {
    clients: {
      async create(input) {
        const rows = await database.insert(clients).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
        return requireClient(rows[0], input.id);
      },
      async getById(input) {
        const rows = await database.select().from(clients).where(and(eq(clients.userId, input.userId), eq(clients.id, input.id))).limit(1);
        return rows[0] ? rowToClient(rows[0]) : undefined;
      },
      async list(input) {
        const search = input.search?.trim();
        const predicates = [eq(clients.userId, input.userId)];
        if (!input.includeDeleted) {
          predicates.push(isNull(clients.deletedAt));
        }
        if (search) {
          const term = `%${search}%`;
          predicates.push(or(ilike(clients.name, term), ilike(clients.email, term), ilike(clients.phone, term), ilike(clients.company, term), ilike(clients.website, term), ilike(clients.notes, term)) ?? eq(clients.userId, input.userId));
        }
        if (input.createdFrom) {
          predicates.push(gte(clients.createdAt, input.createdFrom));
        }
        if (input.createdTo) {
          predicates.push(lte(clients.createdAt, input.createdTo));
        }
        const rows = await database.select().from(clients).where(and(...predicates));
        return filterRowsByTags(database, input.userId, "client", rows, input.tagIds).then((filteredRows) => filteredRows.map(rowToClient));
      },
      async update(input) {
        const rows = await database
          .update(clients)
          .set({ ...input.fields, updatedAt: input.now })
          .where(and(eq(clients.userId, input.userId), eq(clients.id, input.id)))
          .returning();
        return rows[0] ? rowToClient(rows[0]) : undefined;
      },
      async setDeletedAt(input) {
        const rows = await database
          .update(clients)
          .set({ deletedAt: input.deletedAt, updatedAt: input.now })
          .where(and(eq(clients.userId, input.userId), eq(clients.id, input.id)))
          .returning();
        return rows[0] ? rowToClient(rows[0]) : undefined;
      },
    },
    clientAuthorizedEmails: {
      async add(input) {
        const clientRows = await database.select({ id: clients.id }).from(clients).where(and(eq(clients.userId, input.userId), eq(clients.id, input.clientId), isNull(clients.deletedAt))).limit(1);
        if (!clientRows[0]) {
          throw new Error("Client not found.");
        }
        const rows = await database.insert(clientAuthorizedEmails).values({ id: input.id, userId: input.userId, clientId: input.clientId, pattern: input.pattern, createdAt: input.now, updatedAt: input.now }).returning();
        return requireClientAuthorizedEmail(rows[0], input.id);
      },
      async listForClient(input) {
        const rows = await database.select().from(clientAuthorizedEmails).where(and(eq(clientAuthorizedEmails.userId, input.userId), eq(clientAuthorizedEmails.clientId, input.clientId)));
        return rows.map(rowToClientAuthorizedEmail);
      },
      async listForUser(input) {
        const rows = await database.select().from(clientAuthorizedEmails).where(eq(clientAuthorizedEmails.userId, input.userId));
        return rows.map(rowToClientAuthorizedEmail);
      },
      async remove(input) {
        const rows = await database.delete(clientAuthorizedEmails).where(and(eq(clientAuthorizedEmails.userId, input.userId), eq(clientAuthorizedEmails.id, input.id))).returning({ id: clientAuthorizedEmails.id });
        return Boolean(rows[0]);
      },
    },
    leads: {
      async create(input) {
        const rows = await database.insert(leads).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
        return requireLead(rows[0], input.id);
      },
      async getById(input) {
        const rows = await database.select().from(leads).where(and(eq(leads.userId, input.userId), eq(leads.id, input.id))).limit(1);
        return rows[0] ? rowToLead(rows[0]) : undefined;
      },
      async list(input) {
        const search = input.search?.trim();
        const predicates = [eq(leads.userId, input.userId)];
        if (!input.includeDeleted) {
          predicates.push(isNull(leads.deletedAt));
        }
        if (!input.includeConverted) {
          predicates.push(isNull(leads.convertedAt));
        }
        if (input.stage) {
          predicates.push(eq(leads.stage, input.stage));
        }
        if (search) {
          const term = `%${search}%`;
          predicates.push(or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.phone, term), ilike(leads.company, term), ilike(leads.website, term), ilike(leads.notes, term), ilike(leads.source, term)) ?? eq(leads.userId, input.userId));
        }
        if (input.createdFrom) {
          predicates.push(gte(leads.createdAt, input.createdFrom));
        }
        if (input.createdTo) {
          predicates.push(lte(leads.createdAt, input.createdTo));
        }
        const rows = await database.select().from(leads).where(and(...predicates));
        return filterRowsByTags(database, input.userId, "lead", rows, input.tagIds).then((filteredRows) => filteredRows.map(rowToLead));
      },
      async update(input) {
        const rows = await database
          .update(leads)
          .set({ ...input.fields, updatedAt: input.now })
          .where(and(eq(leads.userId, input.userId), eq(leads.id, input.id)))
          .returning();
        return rows[0] ? rowToLead(rows[0]) : undefined;
      },
      async setDeletedAt(input) {
        const rows = await database
          .update(leads)
          .set({ deletedAt: input.deletedAt, updatedAt: input.now })
          .where(and(eq(leads.userId, input.userId), eq(leads.id, input.id)))
          .returning();
        return rows[0] ? rowToLead(rows[0]) : undefined;
      },
      async convert(input) {
        return database.transaction(async (tx) => {
          const convertedRows = await tx
            .update(leads)
            .set({ stage: "won", convertedClientId: input.clientId, convertedAt: input.now, updatedAt: input.now })
            .where(and(eq(leads.userId, input.userId), eq(leads.id, input.leadId), isNull(leads.deletedAt), isNull(leads.convertedAt)))
            .returning();
          const convertedLead = convertedRows[0];
          if (!convertedLead) {
            return undefined;
          }
          const clientRows = await tx
            .insert(clients)
            .values({
              id: input.clientId,
              userId: input.userId,
              name: convertedLead.name,
              email: convertedLead.email,
              phone: convertedLead.phone,
              company: convertedLead.company,
              website: convertedLead.website,
              notes: convertedLead.notes,
              socialLinks: convertedLead.socialLinks,
              address: convertedLead.address,
              customFields: convertedLead.customFields,
              metadata: { ...convertedLead.metadata, convertedFromLeadId: convertedLead.id },
              createdAt: input.now,
              updatedAt: input.now,
            })
            .returning();
          return { lead: rowToLead(convertedLead), client: requireClient(clientRows[0], input.clientId) };
        });
      },
    },
    projects: {
      async create(input) {
        await requireActiveClient(database, input.userId, input.fields.clientId);
        const rows = await database.insert(projects).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
        return requireProject(rows[0], input.id);
      },
      async getById(input) {
        const rows = await database.select().from(projects).where(and(eq(projects.userId, input.userId), eq(projects.id, input.id))).limit(1);
        return rows[0] ? rowToProject(rows[0]) : undefined;
      },
      async list(input) {
        const search = input.search?.trim();
        const predicates = [eq(projects.userId, input.userId)];
        if (!input.includeDeleted) {
          predicates.push(isNull(projects.deletedAt));
        }
        if (input.clientId) {
          predicates.push(eq(projects.clientId, input.clientId));
        }
        if (input.status) {
          predicates.push(eq(projects.status, input.status));
        }
        if (search) {
          const term = `%${search}%`;
          predicates.push(or(ilike(projects.name, term), ilike(projects.description, term)) ?? eq(projects.userId, input.userId));
        }
        if (input.createdFrom) {
          predicates.push(gte(projects.createdAt, input.createdFrom));
        }
        if (input.createdTo) {
          predicates.push(lte(projects.createdAt, input.createdTo));
        }
        const rows = await database.select().from(projects).where(and(...predicates));
        return filterRowsByTags(database, input.userId, "project", rows, input.tagIds).then((filteredRows) => filteredRows.map(rowToProject));
      },
      async update(input) {
        if (input.fields.clientId !== undefined) {
          await requireActiveClient(database, input.userId, input.fields.clientId);
        }
        const rows = await database
          .update(projects)
          .set({ ...input.fields, updatedAt: input.now })
          .where(and(eq(projects.userId, input.userId), eq(projects.id, input.id)))
          .returning();
        return rows[0] ? rowToProject(rows[0]) : undefined;
      },
      async setDeletedAt(input) {
        const rows = await database
          .update(projects)
          .set({ deletedAt: input.deletedAt, updatedAt: input.now })
          .where(and(eq(projects.userId, input.userId), eq(projects.id, input.id)))
          .returning();
        return rows[0] ? rowToProject(rows[0]) : undefined;
      },
    },
    tickets: {
      async create(input) {
        await requireActiveProject(database, input.userId, input.fields.projectId);
        const rows = await database.insert(tickets).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
        return requireTicket(rows[0], input.id);
      },
      async getById(input) {
        const rows = await database.select().from(tickets).where(and(eq(tickets.userId, input.userId), eq(tickets.id, input.id))).limit(1);
        return rows[0] ? rowToTicket(rows[0]) : undefined;
      },
      async list(input) {
        const search = input.search?.trim();
        const predicates = [eq(tickets.userId, input.userId)];
        if (!input.includeDeleted) {
          predicates.push(isNull(tickets.deletedAt));
        }
        if (input.projectId) {
          predicates.push(eq(tickets.projectId, input.projectId));
        }
        if (input.type) {
          predicates.push(eq(tickets.type, input.type));
        }
        if (input.status) {
          predicates.push(eq(tickets.status, input.status));
        }
        if (input.priority) {
          predicates.push(eq(tickets.priority, input.priority));
        }
        if (search) {
          const term = `%${search}%`;
          predicates.push(or(ilike(tickets.title, term), ilike(tickets.description, term)) ?? eq(tickets.userId, input.userId));
        }
        if (input.createdFrom) {
          predicates.push(gte(tickets.createdAt, input.createdFrom));
        }
        if (input.createdTo) {
          predicates.push(lte(tickets.createdAt, input.createdTo));
        }
        const rows = await database.select().from(tickets).where(and(...predicates));
        return filterRowsByTags(database, input.userId, "ticket", rows, input.tagIds).then((filteredRows) => filteredRows.map(rowToTicket));
      },
      async update(input) {
        if (input.fields.projectId !== undefined) {
          await requireActiveProject(database, input.userId, input.fields.projectId);
        }
        const rows = await database
          .update(tickets)
          .set({ ...input.fields, updatedAt: input.now })
          .where(and(eq(tickets.userId, input.userId), eq(tickets.id, input.id)))
          .returning();
        return rows[0] ? rowToTicket(rows[0]) : undefined;
      },
      async setDeletedAt(input) {
        const rows = await database
          .update(tickets)
          .set({ deletedAt: input.deletedAt, updatedAt: input.now })
          .where(and(eq(tickets.userId, input.userId), eq(tickets.id, input.id)))
          .returning();
        return rows[0] ? rowToTicket(rows[0]) : undefined;
      },
    },
    exchanges: {
      async create(input) {
        await validateActiveExchangeParents(database, input.userId, input.fields.clientId ?? null, input.fields.projectId ?? null, input.fields.ticketId ?? null);
        if (input.fields.syncedEmailAccountId) {
          await requireActiveEmailAccount(database, input.userId, input.fields.syncedEmailAccountId);
        }
        const rows = await database.insert(exchanges).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
        return requireExchange(rows[0], input.id);
      },
      async getById(input) {
        const rows = await database.select().from(exchanges).where(and(eq(exchanges.userId, input.userId), eq(exchanges.id, input.id))).limit(1);
        return rows[0] ? rowToExchange(rows[0]) : undefined;
      },
      async list(input) {
        const search = input.search?.trim();
        const predicates = [eq(exchanges.userId, input.userId)];
        if (!input.includeDeleted) {
          predicates.push(isNull(exchanges.deletedAt));
        }
        if (input.type) {
          predicates.push(eq(exchanges.type, input.type));
        }
        if (search) {
          const term = `%${search}%`;
          predicates.push(or(ilike(exchanges.subject, term), ilike(exchanges.body, term), ilike(exchanges.externalMessageId, term), ilike(exchanges.threadId, term)) ?? eq(exchanges.userId, input.userId));
        }
        if (input.occurredFrom) {
          predicates.push(gte(exchanges.occurredAt, input.occurredFrom));
        }
        if (input.occurredTo) {
          predicates.push(lte(exchanges.occurredAt, input.occurredTo));
        }
        const rows = await database.select().from(exchanges).where(and(...predicates)).orderBy(asc(exchanges.occurredAt));
        return filterRowsByTags(database, input.userId, "exchange", rows, input.tagIds).then((filteredRows) => filteredRows.map(rowToExchange));
      },
      async listTimeline(input) {
        const predicates = [eq(exchanges.userId, input.userId)];
        if (!input.includeDeleted) {
          predicates.push(isNull(exchanges.deletedAt));
        }
        if (input.ticketId) {
          predicates.push(eq(exchanges.ticketId, input.ticketId));
        } else if (input.projectId) {
          predicates.push(eq(exchanges.projectId, input.projectId));
        } else if (input.clientId) {
          predicates.push(eq(exchanges.clientId, input.clientId));
        }
        const rows = await database.select().from(exchanges).where(and(...predicates)).orderBy(asc(exchanges.occurredAt));
        return rows.map(rowToExchange);
      },
      async update(input) {
        const currentRows = await database.select().from(exchanges).where(and(eq(exchanges.userId, input.userId), eq(exchanges.id, input.id))).limit(1);
        const current = currentRows[0];
        if (!current) {
          return undefined;
        }
        if (input.fields.clientId !== undefined || input.fields.projectId !== undefined || input.fields.ticketId !== undefined) {
          await validateActiveExchangeParents(
            database,
            input.userId,
            input.fields.clientId === undefined ? current.clientId : input.fields.clientId,
            input.fields.projectId === undefined ? current.projectId : input.fields.projectId,
            input.fields.ticketId === undefined ? current.ticketId : input.fields.ticketId,
          );
        }
        if (input.fields.syncedEmailAccountId) {
          await requireActiveEmailAccount(database, input.userId, input.fields.syncedEmailAccountId);
        }
        const rows = await database
          .update(exchanges)
          .set({ ...input.fields, updatedAt: input.now })
          .where(and(eq(exchanges.userId, input.userId), eq(exchanges.id, input.id)))
          .returning();
        return rows[0] ? rowToExchange(rows[0]) : undefined;
      },
      async setDeletedAt(input) {
        const rows = await database
          .update(exchanges)
          .set({ deletedAt: input.deletedAt, updatedAt: input.now })
          .where(and(eq(exchanges.userId, input.userId), eq(exchanges.id, input.id)))
          .returning();
        return rows[0] ? rowToExchange(rows[0]) : undefined;
      },
    },
    tags: {
      async create(input) {
        await assertTagNameAvailable(database, input.userId, input.fields.name);
        try {
          const rows = await database.insert(tags).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
          return requireTag(rows[0], input.id);
        } catch (error) {
          throw translateTagNameUniqueError(error, input.fields.name);
        }
      },
      async list(input) {
        const rows = await database
          .select()
          .from(tags)
          .where(input.includeDeleted ? eq(tags.userId, input.userId) : and(eq(tags.userId, input.userId), isNull(tags.deletedAt)));
        return rows.map(rowToTag);
      },
      async update(input) {
        if (input.fields.name !== undefined) {
          await assertTagNameAvailable(database, input.userId, input.fields.name, input.id);
        }
        try {
          const rows = await database
            .update(tags)
            .set({ ...input.fields, updatedAt: input.now })
            .where(and(eq(tags.userId, input.userId), eq(tags.id, input.id)))
            .returning();
          return rows[0] ? rowToTag(rows[0]) : undefined;
        } catch (error) {
          if (input.fields.name !== undefined) {
            throw translateTagNameUniqueError(error, input.fields.name);
          }
          throw error;
        }
      },
      async setDeletedAt(input) {
        const rows = await database
          .update(tags)
          .set({ deletedAt: input.deletedAt, updatedAt: input.now })
          .where(and(eq(tags.userId, input.userId), eq(tags.id, input.id)))
          .returning();
        return rows[0] ? rowToTag(rows[0]) : undefined;
      },
      async getById(input) {
        const rows = await database.select().from(tags).where(and(eq(tags.userId, input.userId), eq(tags.id, input.id))).limit(1);
        return rows[0] ? rowToTag(rows[0]) : undefined;
      },
    },
    entityTags: {
      async attach(input) {
        const rows = await database
          .insert(entityTags)
          .values({ userId: input.userId, tagId: input.tagId, entityType: input.entityType, entityId: input.entityId, createdAt: input.now, updatedAt: input.now })
          .onConflictDoNothing()
          .returning();
        if (rows[0]) {
          return rowToEntityTag(rows[0]);
        }
        const existing = await database
          .select()
          .from(entityTags)
          .where(and(eq(entityTags.userId, input.userId), eq(entityTags.tagId, input.tagId), eq(entityTags.entityType, input.entityType), eq(entityTags.entityId, input.entityId)))
          .limit(1);
        return requireEntityTag(existing[0], input.tagId);
      },
      async detach(input) {
        const rows = await database
          .delete(entityTags)
          .where(and(eq(entityTags.userId, input.userId), eq(entityTags.tagId, input.tagId), eq(entityTags.entityType, input.entityType), eq(entityTags.entityId, input.entityId)))
          .returning();
        return rows.length > 0;
      },
      async listForEntity(input) {
        const rows = await database.select().from(entityTags).where(and(eq(entityTags.userId, input.userId), eq(entityTags.entityType, input.entityType), eq(entityTags.entityId, input.entityId)));
        return rows.map(rowToEntityTag);
      },
    },
    attachments: {
      async create(input) {
        const rows = await database.insert(attachments).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
        return requireAttachment(rows[0], input.id);
      },
      async createWithinUserQuota(input) {
        return database.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(${ATTACHMENT_QUOTA_LOCK_NAMESPACE}, hashtext(${input.userId}))`);
          const totalRows = await tx.select({ total: sum(attachments.byteSize) }).from(attachments).where(and(eq(attachments.userId, input.userId), isNull(attachments.deletedAt)));
          const usedBytes = Number(totalRows[0]?.total ?? 0);
          if (usedBytes + input.fields.byteSize > input.userQuotaBytes) {
            return undefined;
          }
          const rows = await tx.insert(attachments).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
          return requireAttachment(rows[0], input.id);
        });
      },
      async listForTarget(input) {
        const rows = await database
          .select()
          .from(attachments)
          .where(input.includeDeleted ? and(eq(attachments.userId, input.userId), eq(attachments.targetType, input.targetType), eq(attachments.targetId, input.targetId)) : and(eq(attachments.userId, input.userId), eq(attachments.targetType, input.targetType), eq(attachments.targetId, input.targetId), isNull(attachments.deletedAt)))
          .orderBy(asc(attachments.createdAt));
        return rows.map(rowToAttachment);
      },
      async sumByteSizeForUser(input) {
        const rows = await database.select({ total: sum(attachments.byteSize) }).from(attachments).where(and(eq(attachments.userId, input.userId), isNull(attachments.deletedAt)));
        return Number(rows[0]?.total ?? 0);
      },
    },
    notifications: {
      async create(input) {
        const rows = await database.insert(notifications).values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now }).returning();
        return requireNotification(rows[0], input.id);
      },
      async list(input) {
        const rows = await database
          .select()
          .from(notifications)
          .where(input.unreadOnly ? and(eq(notifications.userId, input.userId), isNull(notifications.readAt)) : eq(notifications.userId, input.userId))
          .orderBy(desc(notifications.createdAt))
          .limit(input.limit ?? 50);
        return rows.map(rowToNotification);
      },
      async listAll(input) {
        const rows = await database
          .select()
          .from(notifications)
          .where(input.unreadOnly ? and(eq(notifications.userId, input.userId), isNull(notifications.readAt)) : eq(notifications.userId, input.userId))
          .orderBy(desc(notifications.createdAt));
        return rows.map(rowToNotification);
      },
      async markRead(input) {
        const rows = await database
          .update(notifications)
          .set({ readAt: input.now, updatedAt: input.now })
          .where(and(eq(notifications.userId, input.userId), eq(notifications.id, input.id)))
          .returning();
        return rows[0] ? rowToNotification(rows[0]) : undefined;
      },
    },
    userSettings: {
      async getByUserId(input) {
        const rows = await database.select().from(userSettings).where(eq(userSettings.userId, input.userId)).limit(1);
        return rows[0] ? rowToUserSettings(rows[0]) : undefined;
      },
      async upsert(input) {
        const rows = await database
          .insert(userSettings)
          .values({ id: input.id, userId: input.userId, ...input.fields, createdAt: input.now, updatedAt: input.now })
          .onConflictDoUpdate({ target: userSettings.userId, set: { ...input.fields, updatedAt: input.now } })
          .returning();
        return requireUserSettings(rows[0], input.userId);
      },
    },
  };
}

function rowToClient(row: typeof clients.$inferSelect): ClientRecord {
  return row;
}

function rowToClientAuthorizedEmail(row: typeof clientAuthorizedEmails.$inferSelect): ClientAuthorizedEmailRecord {
  return row;
}

function rowToTag(row: typeof tags.$inferSelect): TagRecord {
  return row;
}

function rowToLead(row: typeof leads.$inferSelect): LeadRecord {
  return row;
}

function rowToProject(row: typeof projects.$inferSelect): ProjectRecord {
  return row;
}

function rowToTicket(row: typeof tickets.$inferSelect): TicketRecord {
  return row;
}

function rowToExchange(row: typeof exchanges.$inferSelect): ExchangeRecord {
  return row;
}

function rowToEntityTag(row: typeof entityTags.$inferSelect): EntityTagRecord {
  return row;
}

function rowToAttachment(row: typeof attachments.$inferSelect): AttachmentRecord {
  return row;
}

function rowToNotification(row: typeof notifications.$inferSelect): NotificationRecord {
  return row;
}

function rowToUserSettings(row: typeof userSettings.$inferSelect): UserSettingsRecord {
  return { ...row, locale: resolveLocale(row.locale) };
}

function requireClient(row: typeof clients.$inferSelect | undefined, id: string): ClientRecord {
  if (!row) {
    throw new Error(`Client could not be persisted: ${id}`);
  }
  return rowToClient(row);
}

function requireClientAuthorizedEmail(row: typeof clientAuthorizedEmails.$inferSelect | undefined, id: string): ClientAuthorizedEmailRecord {
  if (!row) {
    throw new Error(`Client authorized email could not be persisted: ${id}`);
  }
  return rowToClientAuthorizedEmail(row);
}

function requireTag(row: typeof tags.$inferSelect | undefined, id: string): TagRecord {
  if (!row) {
    throw new Error(`Tag could not be persisted: ${id}`);
  }
  return rowToTag(row);
}

function requireLead(row: typeof leads.$inferSelect | undefined, id: string): LeadRecord {
  if (!row) {
    throw new Error(`Lead could not be persisted: ${id}`);
  }
  return rowToLead(row);
}

function requireProject(row: typeof projects.$inferSelect | undefined, id: string): ProjectRecord {
  if (!row) {
    throw new Error(`Project could not be persisted: ${id}`);
  }
  return rowToProject(row);
}

function requireTicket(row: typeof tickets.$inferSelect | undefined, id: string): TicketRecord {
  if (!row) {
    throw new Error(`Ticket could not be persisted: ${id}`);
  }
  return rowToTicket(row);
}

function requireExchange(row: typeof exchanges.$inferSelect | undefined, id: string): ExchangeRecord {
  if (!row) {
    throw new Error(`Exchange could not be persisted: ${id}`);
  }
  return rowToExchange(row);
}

function requireEntityTag(row: typeof entityTags.$inferSelect | undefined, tagId: string): EntityTagRecord {
  if (!row) {
    throw new Error(`Entity tag could not be persisted: ${tagId}`);
  }
  return rowToEntityTag(row);
}

function requireAttachment(row: typeof attachments.$inferSelect | undefined, id: string): AttachmentRecord {
  if (!row) {
    throw new Error(`Attachment could not be persisted: ${id}`);
  }
  return rowToAttachment(row);
}

function requireNotification(row: typeof notifications.$inferSelect | undefined, id: string): NotificationRecord {
  if (!row) {
    throw new Error(`Notification could not be persisted: ${id}`);
  }
  return rowToNotification(row);
}

function requireUserSettings(row: typeof userSettings.$inferSelect | undefined, userId: string): UserSettingsRecord {
  if (!row) {
    throw new Error(`Settings could not be persisted for user: ${userId}`);
  }
  return rowToUserSettings(row);
}

async function requireActiveClient(database: CrmDatabase, userId: string, clientId: string): Promise<typeof clients.$inferSelect> {
  const rows = await database.select().from(clients).where(and(eq(clients.userId, userId), eq(clients.id, clientId), isNull(clients.deletedAt))).limit(1);
  const client = rows[0];
  if (!client) {
    throw new Error("Client not found.");
  }
  return client;
}

async function requireActiveProject(database: CrmDatabase, userId: string, projectId: string): Promise<typeof projects.$inferSelect> {
  const rows = await database.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
  const project = rows[0];
  if (!project) {
    throw new Error("Project not found.");
  }
  await requireActiveClient(database, userId, project.clientId);
  return project;
}

async function requireActiveTicket(database: CrmDatabase, userId: string, ticketId: string): Promise<typeof tickets.$inferSelect> {
  const rows = await database.select().from(tickets).where(and(eq(tickets.userId, userId), eq(tickets.id, ticketId), isNull(tickets.deletedAt))).limit(1);
  const ticket = rows[0];
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  await requireActiveProject(database, userId, ticket.projectId);
  return ticket;
}

async function requireActiveEmailAccount(database: CrmDatabase, userId: string, emailAccountId: string): Promise<void> {
  const rows = await database.select({ id: emailAccounts.id }).from(emailAccounts).where(and(eq(emailAccounts.userId, userId), eq(emailAccounts.id, emailAccountId), eq(emailAccounts.enabled, true), isNull(emailAccounts.deletedAt))).limit(1);
  if (!rows[0]) {
    throw new Error("Email account not found.");
  }
}

async function assertTagNameAvailable(database: CrmDatabase, userId: string, name: string, exceptId?: string): Promise<void> {
  const predicates = [eq(tags.userId, userId), eq(tags.name, name)];
  if (exceptId !== undefined) {
    predicates.push(ne(tags.id, exceptId));
  }
  const rows = await database.select({ id: tags.id }).from(tags).where(and(...predicates)).limit(1);
  if (rows[0]) {
    throw new DuplicateTagNameError(name);
  }
}

function translateTagNameUniqueError(error: unknown, name: string): Error {
  if (isTagNameUniqueViolation(error)) {
    return new DuplicateTagNameError(name);
  }
  return error instanceof Error ? error : new Error("Tag persistence failed.");
}

function isTagNameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeError = error as { readonly code?: unknown; readonly constraint?: unknown };
  return maybeError.code === "23505" && maybeError.constraint === "tags_user_id_name_idx";
}

async function validateActiveExchangeParents(database: CrmDatabase, userId: string, clientId: string | null | undefined, projectId: string | null | undefined, ticketId: string | null | undefined): Promise<void> {
  if (ticketId) {
    const ticket = await requireActiveTicket(database, userId, ticketId);
    const project = await requireActiveProject(database, userId, ticket.projectId);
    const client = await requireActiveClient(database, userId, project.clientId);
    if (projectId && projectId !== project.id) {
      throw new Error("Exchange project does not match ticket project.");
    }
    if (clientId && clientId !== client.id) {
      throw new Error("Exchange client does not match project client.");
    }
    return;
  }
  if (projectId) {
    const project = await requireActiveProject(database, userId, projectId);
    const client = await requireActiveClient(database, userId, project.clientId);
    if (clientId && clientId !== client.id) {
      throw new Error("Exchange client does not match project client.");
    }
    return;
  }
  if (clientId) {
    await requireActiveClient(database, userId, clientId);
  }
}

function filterRowsByTags<TRow extends { readonly id: string }>(database: CrmDatabase, userId: string, entityType: AttachmentTargetType, rows: readonly TRow[], tagIds: readonly string[] | undefined): Promise<readonly TRow[]> {
  if (!tagIds || tagIds.length === 0 || rows.length === 0) {
    return Promise.resolve(rows);
  }
  const rowIds = rows.map((row) => row.id);
  return database
    .select({ entityId: entityTags.entityId, tagId: entityTags.tagId })
    .from(entityTags)
    .where(and(eq(entityTags.userId, userId), eq(entityTags.entityType, entityType), inArray(entityTags.entityId, rowIds), inArray(entityTags.tagId, [...tagIds])))
    .then((matches) => rows.filter((row) => tagIds.every((tagId) => matches.some((match) => match.entityId === row.id && match.tagId === tagId))));
}
