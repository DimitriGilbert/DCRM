import type {
  AttachmentMutationFields,
  AttachmentRecord,
  AttachmentTargetInput,
  ClientIdInput,
  ClientAuthorizedEmailRecord,
  ClientListInput,
  ClientMutationFields,
  ClientRecord,
  ClientUpdateFields,
  EntityTagInput,
  EntityTagRecord,
  ExchangeIdInput,
  ExchangeListInput,
  ExchangeMutationFields,
  ExchangeRecord,
  ExchangeTimelineInput,
  ExchangeUpdateFields,
  LeadIdInput,
  LeadListInput,
  LeadMutationFields,
  LeadRecord,
  LeadUpdateFields,
  NotificationMutationFields,
  NotificationRecord,
  ProjectIdInput,
  ProjectListInput,
  ProjectMutationFields,
  ProjectRecord,
  ProjectUpdateFields,
  TagMutationFields,
  TagRecord,
  TicketIdInput,
  TicketListInput,
  TicketMutationFields,
  TicketRecord,
  TicketUpdateFields,
  UserSettingsMutationFields,
  UserSettingsRecord,
} from "./types.js";

import { authorizedEmailPatternsOverlap, normalizeAuthorizedEmailPattern } from "../email/matching.js";

export type CrmRepository = {
  readonly clients: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: ClientMutationFields; readonly now: Date }) => Promise<ClientRecord>;
    readonly getById: (input: ClientIdInput) => Promise<ClientRecord | undefined>;
    readonly list: (input: ClientListInput) => Promise<readonly ClientRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: ClientUpdateFields; readonly now: Date }) => Promise<ClientRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<ClientRecord | undefined>;
  };
  readonly clientAuthorizedEmails: {
    readonly add: (input: { readonly id: string; readonly userId: string; readonly clientId: string; readonly pattern: string; readonly now: Date }) => Promise<ClientAuthorizedEmailRecord>;
    readonly listForClient: (input: { readonly userId: string; readonly clientId: string }) => Promise<readonly ClientAuthorizedEmailRecord[]>;
    readonly listForUser: (input: { readonly userId: string }) => Promise<readonly ClientAuthorizedEmailRecord[]>;
    readonly remove: (input: { readonly userId: string; readonly id: string }) => Promise<boolean>;
  };
  readonly leads: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: LeadMutationFields; readonly now: Date }) => Promise<LeadRecord>;
    readonly getById: (input: LeadIdInput) => Promise<LeadRecord | undefined>;
    readonly list: (input: LeadListInput) => Promise<readonly LeadRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: LeadUpdateFields; readonly now: Date; readonly expectedStage?: LeadRecord["stage"] }) => Promise<LeadRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<LeadRecord | undefined>;
    readonly convert: (input: { readonly userId: string; readonly leadId: string; readonly clientId: string; readonly now: Date }) => Promise<{ readonly lead: LeadRecord; readonly client: ClientRecord } | undefined>;
  };
  readonly projects: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: ProjectMutationFields; readonly now: Date }) => Promise<ProjectRecord>;
    readonly getById: (input: ProjectIdInput) => Promise<ProjectRecord | undefined>;
    readonly list: (input: ProjectListInput) => Promise<readonly ProjectRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: ProjectUpdateFields; readonly now: Date; readonly expectedStatus?: ProjectRecord["status"] }) => Promise<ProjectRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<ProjectRecord | undefined>;
  };
  readonly tickets: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: TicketMutationFields; readonly now: Date }) => Promise<TicketRecord>;
    readonly getById: (input: TicketIdInput) => Promise<TicketRecord | undefined>;
    readonly list: (input: TicketListInput) => Promise<readonly TicketRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: TicketUpdateFields; readonly now: Date }) => Promise<TicketRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<TicketRecord | undefined>;
  };
  readonly exchanges: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: ExchangeMutationFields; readonly now: Date }) => Promise<ExchangeRecord>;
    readonly getById: (input: ExchangeIdInput) => Promise<ExchangeRecord | undefined>;
    readonly list: (input: ExchangeListInput) => Promise<readonly ExchangeRecord[]>;
    readonly listTimeline: (input: ExchangeTimelineInput) => Promise<readonly ExchangeRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: ExchangeUpdateFields; readonly now: Date }) => Promise<ExchangeRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<ExchangeRecord | undefined>;
  };
  readonly tags: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: TagMutationFields; readonly now: Date }) => Promise<TagRecord>;
    readonly list: (input: { readonly userId: string; readonly includeDeleted?: boolean }) => Promise<readonly TagRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: Partial<TagMutationFields>; readonly now: Date }) => Promise<TagRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<TagRecord | undefined>;
    readonly getById: (input: { readonly userId: string; readonly id: string }) => Promise<TagRecord | undefined>;
  };
  readonly entityTags: {
    readonly attach: (input: EntityTagInput & { readonly now: Date }) => Promise<EntityTagRecord>;
    readonly detach: (input: EntityTagInput) => Promise<boolean>;
    readonly listForEntity: (input: Omit<EntityTagInput, "tagId">) => Promise<readonly EntityTagRecord[]>;
  };
  readonly attachments: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: AttachmentMutationFields; readonly now: Date }) => Promise<AttachmentRecord>;
    readonly createWithinUserQuota: (input: { readonly id: string; readonly userId: string; readonly fields: AttachmentMutationFields; readonly now: Date; readonly userQuotaBytes: number }) => Promise<AttachmentRecord | undefined>;
    readonly listForTarget: (input: AttachmentTargetInput) => Promise<readonly AttachmentRecord[]>;
    readonly sumByteSizeForUser: (input: { readonly userId: string }) => Promise<number>;
  };
  readonly notifications: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: NotificationMutationFields; readonly now: Date }) => Promise<NotificationRecord>;
    readonly list: (input: { readonly userId: string; readonly unreadOnly?: boolean; readonly limit?: number }) => Promise<readonly NotificationRecord[]>;
    readonly listAll: (input: { readonly userId: string; readonly unreadOnly?: boolean }) => Promise<readonly NotificationRecord[]>;
    readonly markRead: (input: { readonly userId: string; readonly id: string; readonly now: Date }) => Promise<NotificationRecord | undefined>;
  };
  readonly userSettings: {
    readonly getByUserId: (input: { readonly userId: string }) => Promise<UserSettingsRecord | undefined>;
    readonly upsert: (input: { readonly id: string; readonly userId: string; readonly fields: UserSettingsMutationFields; readonly now: Date }) => Promise<UserSettingsRecord>;
  };
};

export type ActiveEmailAccountLookup = (input: { readonly userId: string; readonly emailAccountId: string }) => boolean | Promise<boolean>;

export class DuplicateTagNameError extends Error {
  constructor(readonly tagName: string) {
    super(`Tag name is already reserved: ${tagName}`);
    this.name = "DuplicateTagNameError";
  }
}

export class TicketProjectMoveBlockedError extends Error {
  constructor(readonly ticketId: string) {
    super("Ticket project cannot be changed while exchanges or comments are attached.");
    this.name = "TicketProjectMoveBlockedError";
  }
}

export function createInMemoryCrmRepository(options: { readonly isActiveEmailAccount?: ActiveEmailAccountLookup } = {}): CrmRepository {
  const clients: ClientRecord[] = [];
  const clientAuthorizedEmails: ClientAuthorizedEmailRecord[] = [];
  const leads: LeadRecord[] = [];
  const projects: ProjectRecord[] = [];
  const tickets: TicketRecord[] = [];
  const exchanges: ExchangeRecord[] = [];
  const tags: TagRecord[] = [];
  const entityTags: EntityTagRecord[] = [];
  const attachments: AttachmentRecord[] = [];
  const notifications: NotificationRecord[] = [];
  const userSettings: UserSettingsRecord[] = [];

  return {
    clients: {
      async create(input) {
        const record: ClientRecord = {
          id: input.id,
          userId: input.userId,
          name: input.fields.name,
          email: input.fields.email ?? null,
          phone: input.fields.phone ?? null,
          company: input.fields.company ?? null,
          website: input.fields.website ?? null,
          notes: input.fields.notes ?? null,
          socialLinks: input.fields.socialLinks ?? {},
          address: input.fields.address ?? {},
          customFields: input.fields.customFields ?? {},
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        clients.push(record);
        return record;
      },
      async getById(input) {
        return clients.find((client) => client.userId === input.userId && client.id === input.id);
      },
      async list(input) {
        const search = input.search?.trim().toLowerCase();
        return clients.filter((client) => {
          if (client.userId !== input.userId) {
            return false;
          }
          if (!input.includeDeleted && client.deletedAt) {
            return false;
          }
          if (!matchesTagFilter(entityTags, input.userId, "client", client.id, input.tagIds)) {
            return false;
          }
          if (!matchesDateRange(client.createdAt, input.createdFrom, input.createdTo)) {
            return false;
          }
          if (!search) {
            return true;
          }
          return [client.name, client.email, client.phone, client.company, client.website, client.notes].some((value) => value?.toLowerCase().includes(search));
        });
      },
      async update(input) {
        return updateById(clients, input.userId, input.id, (client) => ({
          ...client,
          ...input.fields,
          updatedAt: input.now,
          email: input.fields.email === undefined ? client.email : input.fields.email,
          phone: input.fields.phone === undefined ? client.phone : input.fields.phone,
          company: input.fields.company === undefined ? client.company : input.fields.company,
          website: input.fields.website === undefined ? client.website : input.fields.website,
          notes: input.fields.notes === undefined ? client.notes : input.fields.notes,
        }));
      },
      async setDeletedAt(input) {
        return updateById(clients, input.userId, input.id, (client) => ({ ...client, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
    },
    clientAuthorizedEmails: {
      async add(input) {
        const existingClient = clients.find((client) => client.userId === input.userId && client.id === input.clientId && !client.deletedAt);
        if (!existingClient) {
          throw new Error("Client not found.");
        }
        assertAuthorizedEmailPatternAvailable(clientAuthorizedEmails, input.userId, input.clientId, input.pattern);
        const record: ClientAuthorizedEmailRecord = {
          id: input.id,
          userId: input.userId,
          clientId: input.clientId,
          pattern: input.pattern,
          createdAt: input.now,
          updatedAt: input.now,
        };
        clientAuthorizedEmails.push(record);
        return record;
      },
      async listForClient(input) {
        return clientAuthorizedEmails.filter((record) => record.userId === input.userId && record.clientId === input.clientId);
      },
      async listForUser(input) {
        return clientAuthorizedEmails.filter((record) => record.userId === input.userId).toSorted(compareClientAuthorizedEmails);
      },
      async remove(input) {
        const index = clientAuthorizedEmails.findIndex((record) => record.userId === input.userId && record.id === input.id);
        if (index === -1) {
          return false;
        }
        clientAuthorizedEmails.splice(index, 1);
        return true;
      },
    },
    leads: {
      async create(input) {
        const record: LeadRecord = {
          id: input.id,
          userId: input.userId,
          convertedClientId: null,
          name: input.fields.name,
          email: input.fields.email ?? null,
          phone: input.fields.phone ?? null,
          company: input.fields.company ?? null,
          website: input.fields.website ?? null,
          notes: input.fields.notes ?? null,
          source: input.fields.source ?? null,
          stage: input.fields.stage ?? "new",
          estimatedValueAmount: input.fields.estimatedValueAmount ?? null,
          estimatedValueCurrency: input.fields.estimatedValueCurrency ?? null,
          socialLinks: input.fields.socialLinks ?? {},
          address: input.fields.address ?? {},
          customFields: input.fields.customFields ?? {},
          metadata: input.fields.metadata ?? {},
          convertedAt: null,
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        leads.push(record);
        return record;
      },
      async getById(input) {
        return leads.find((lead) => lead.userId === input.userId && lead.id === input.id);
      },
      async list(input) {
        const search = input.search?.trim().toLowerCase();
        return leads.filter((lead) => {
          if (lead.userId !== input.userId) {
            return false;
          }
          if (!input.includeDeleted && lead.deletedAt) {
            return false;
          }
          if (!input.includeConverted && lead.convertedAt) {
            return false;
          }
          if (input.stage && lead.stage !== input.stage) {
            return false;
          }
          if (!matchesTagFilter(entityTags, input.userId, "lead", lead.id, input.tagIds)) {
            return false;
          }
          if (!matchesDateRange(lead.createdAt, input.createdFrom, input.createdTo)) {
            return false;
          }
          if (!search) {
            return true;
          }
          return [lead.name, lead.email, lead.phone, lead.company, lead.website, lead.notes, lead.source].some((value) => value?.toLowerCase().includes(search));
        });
      },
      async update(input) {
        return updateById(leads, input.userId, input.id, (lead) => {
          if (lead.deletedAt) {
            return undefined;
          }
          if (input.expectedStage !== undefined && lead.stage !== input.expectedStage) {
            return undefined;
          }
          if (input.fields.stage !== undefined && input.fields.stage !== "won" && lead.convertedAt) {
            return undefined;
          }
          return {
            ...lead,
            ...input.fields,
            updatedAt: input.now,
            email: input.fields.email === undefined ? lead.email : input.fields.email,
            phone: input.fields.phone === undefined ? lead.phone : input.fields.phone,
            company: input.fields.company === undefined ? lead.company : input.fields.company,
            website: input.fields.website === undefined ? lead.website : input.fields.website,
            notes: input.fields.notes === undefined ? lead.notes : input.fields.notes,
            source: input.fields.source === undefined ? lead.source : input.fields.source,
            estimatedValueAmount: input.fields.estimatedValueAmount === undefined ? lead.estimatedValueAmount : input.fields.estimatedValueAmount,
            estimatedValueCurrency: input.fields.estimatedValueCurrency === undefined ? lead.estimatedValueCurrency : input.fields.estimatedValueCurrency,
          };
        });
      },
      async setDeletedAt(input) {
        return updateById(leads, input.userId, input.id, (lead) => ({ ...lead, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
      async convert(input) {
        const lead = leads.find((candidate) => candidate.userId === input.userId && candidate.id === input.leadId && !candidate.deletedAt && !candidate.convertedAt && candidate.stage === "won");
        if (!lead) {
          return undefined;
        }
        const client: ClientRecord = {
          id: input.clientId,
          userId: input.userId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          website: lead.website,
          notes: lead.notes,
          socialLinks: lead.socialLinks,
          address: lead.address,
          customFields: lead.customFields,
          metadata: { ...lead.metadata, convertedFromLeadId: lead.id },
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        clients.push(client);
        const converted = await updateById(leads, input.userId, input.leadId, (record) => {
          const convertedRecord: LeadRecord = { ...record, stage: "won", convertedClientId: client.id, convertedAt: input.now, updatedAt: input.now };
          return convertedRecord;
        });
        return converted ? { lead: converted, client } : undefined;
      },
    },
    projects: {
      async create(input) {
        requireActiveClient(clients, input.userId, input.fields.clientId);
        const record: ProjectRecord = {
          id: input.id,
          userId: input.userId,
          clientId: input.fields.clientId,
          name: input.fields.name,
          description: input.fields.description ?? null,
          status: input.fields.status ?? "planning",
          budgetAmount: input.fields.budgetAmount ?? null,
          budgetCurrency: input.fields.budgetCurrency ?? null,
          estimatedHours: input.fields.estimatedHours ?? null,
          actualHours: input.fields.actualHours ?? null,
          startsAt: input.fields.startsAt ?? null,
          dueAt: input.fields.dueAt ?? null,
          completedAt: input.fields.completedAt ?? null,
          customFields: input.fields.customFields ?? {},
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        projects.push(record);
        return record;
      },
      async getById(input) {
        return projects.find((project) => project.userId === input.userId && project.id === input.id);
      },
      async list(input) {
        const search = input.search?.trim().toLowerCase();
        return projects.filter((project) => {
          if (project.userId !== input.userId) {
            return false;
          }
          if (!input.includeDeleted && project.deletedAt) {
            return false;
          }
          if (input.clientId && project.clientId !== input.clientId) {
            return false;
          }
          if (input.status && project.status !== input.status) {
            return false;
          }
          if (!matchesTagFilter(entityTags, input.userId, "project", project.id, input.tagIds)) {
            return false;
          }
          if (!matchesDateRange(project.createdAt, input.createdFrom, input.createdTo)) {
            return false;
          }
          if (!search) {
            return true;
          }
          return [project.name, project.description].some((value) => value?.toLowerCase().includes(search));
        });
      },
      async update(input) {
        if (input.fields.clientId !== undefined) {
          requireActiveClient(clients, input.userId, input.fields.clientId);
        }
        return updateById(projects, input.userId, input.id, (project) => {
          if (project.deletedAt) {
            return undefined;
          }
          if (input.expectedStatus !== undefined && project.status !== input.expectedStatus) {
            return undefined;
          }
          return {
            ...project,
            ...input.fields,
            updatedAt: input.now,
            description: input.fields.description === undefined ? project.description : input.fields.description,
            budgetAmount: input.fields.budgetAmount === undefined ? project.budgetAmount : input.fields.budgetAmount,
            budgetCurrency: input.fields.budgetCurrency === undefined ? project.budgetCurrency : input.fields.budgetCurrency,
            estimatedHours: input.fields.estimatedHours === undefined ? project.estimatedHours : input.fields.estimatedHours,
            actualHours: input.fields.actualHours === undefined ? project.actualHours : input.fields.actualHours,
            startsAt: input.fields.startsAt === undefined ? project.startsAt : input.fields.startsAt,
            dueAt: input.fields.dueAt === undefined ? project.dueAt : input.fields.dueAt,
            completedAt: input.fields.completedAt === undefined ? project.completedAt : input.fields.completedAt,
          };
        });
      },
      async setDeletedAt(input) {
        return updateById(projects, input.userId, input.id, (project) => ({ ...project, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
    },
    tickets: {
      async create(input) {
        requireActiveProject(projects, clients, input.userId, input.fields.projectId);
        const record: TicketRecord = {
          id: input.id,
          userId: input.userId,
          projectId: input.fields.projectId,
          title: input.fields.title,
          description: input.fields.description ?? null,
          type: input.fields.type ?? "task",
          status: input.fields.status ?? "open",
          priority: input.fields.priority ?? "normal",
          dueAt: input.fields.dueAt ?? null,
          closedAt: input.fields.closedAt ?? null,
          customFields: input.fields.customFields ?? {},
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        tickets.push(record);
        return record;
      },
      async getById(input) {
        return tickets.find((ticket) => ticket.userId === input.userId && ticket.id === input.id);
      },
      async list(input) {
        const search = input.search?.trim().toLowerCase();
        return tickets.filter((ticket) => {
          if (ticket.userId !== input.userId) {
            return false;
          }
          if (!input.includeDeleted && ticket.deletedAt) {
            return false;
          }
          if (!input.includeInactiveParent && !hasActiveTicketProject(projects, clients, input.userId, ticket.projectId)) {
            return false;
          }
          if (input.projectId && ticket.projectId !== input.projectId) {
            return false;
          }
          if (input.type && ticket.type !== input.type) {
            return false;
          }
          if (input.status && ticket.status !== input.status) {
            return false;
          }
          if (input.priority && ticket.priority !== input.priority) {
            return false;
          }
          if (!matchesTagFilter(entityTags, input.userId, "ticket", ticket.id, input.tagIds)) {
            return false;
          }
          if (!matchesDateRange(ticket.createdAt, input.createdFrom, input.createdTo)) {
            return false;
          }
          if (!search) {
            return true;
          }
          return [ticket.title, ticket.description].some((value) => value?.toLowerCase().includes(search));
        });
      },
      async update(input) {
        return updateById(tickets, input.userId, input.id, (ticket) => {
          if (ticket.deletedAt) {
            return undefined;
          }
          const nextProjectId = input.fields.projectId ?? ticket.projectId;
          requireActiveProject(projects, clients, input.userId, nextProjectId);
          if (nextProjectId !== ticket.projectId && hasActiveTicketExchanges(exchanges, input.userId, ticket.id)) {
            throw new TicketProjectMoveBlockedError(ticket.id);
          }
          return {
            ...ticket,
            ...input.fields,
            updatedAt: input.now,
            description: input.fields.description === undefined ? ticket.description : input.fields.description,
            dueAt: input.fields.dueAt === undefined ? ticket.dueAt : input.fields.dueAt,
            closedAt: input.fields.closedAt === undefined ? ticket.closedAt : input.fields.closedAt,
          };
        });
      },
      async setDeletedAt(input) {
        return updateById(tickets, input.userId, input.id, (ticket) => {
          if (ticket.deletedAt || !hasActiveTicketProject(projects, clients, input.userId, ticket.projectId)) {
            return undefined;
          }
          return { ...ticket, deletedAt: input.deletedAt, updatedAt: input.now };
        });
      },
    },
    exchanges: {
      async create(input) {
        validateActiveExchangeParents({ clients, projects, tickets, userId: input.userId, clientId: input.fields.clientId ?? null, projectId: input.fields.projectId ?? null, ticketId: input.fields.ticketId ?? null });
        if (input.fields.syncedEmailAccountId) {
          await requireActiveEmailAccount(options.isActiveEmailAccount, input.userId, input.fields.syncedEmailAccountId);
        }
        const record: ExchangeRecord = {
          id: input.id,
          userId: input.userId,
          clientId: input.fields.clientId ?? null,
          projectId: input.fields.projectId ?? null,
          ticketId: input.fields.ticketId ?? null,
          type: input.fields.type,
          visibility: input.fields.visibility ?? "internal",
          subject: input.fields.subject ?? null,
          body: input.fields.body,
          occurredAt: input.fields.occurredAt ?? input.now,
          externalMessageId: input.fields.externalMessageId ?? null,
          syncedEmailAccountId: input.fields.syncedEmailAccountId ?? null,
          syncedEmailMailbox: input.fields.syncedEmailMailbox ?? null,
          syncedEmailUid: input.fields.syncedEmailUid ?? null,
          threadId: input.fields.threadId ?? null,
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        if (record.syncedEmailAccountId && record.syncedEmailMailbox && record.syncedEmailUid) {
          const duplicate = exchanges.find((exchange) => exchange.userId === record.userId && exchange.syncedEmailAccountId === record.syncedEmailAccountId && exchange.syncedEmailMailbox === record.syncedEmailMailbox && exchange.syncedEmailUid === record.syncedEmailUid);
          if (duplicate) {
            throw new UniqueConstraintError("exchanges_synced_email_identity_idx");
          }
        }
        exchanges.push(record);
        return record;
      },
      async getById(input) {
        return exchanges.find((exchange) => exchange.userId === input.userId && exchange.id === input.id);
      },
      async list(input) {
        const search = input.search?.trim().toLowerCase();
        return exchanges
          .filter((exchange) => {
            if (exchange.userId !== input.userId) {
              return false;
            }
            if (!input.includeDeleted && exchange.deletedAt) {
              return false;
            }
            if (input.type && exchange.type !== input.type) {
              return false;
            }
            if (!matchesTagFilter(entityTags, input.userId, "exchange", exchange.id, input.tagIds)) {
              return false;
            }
            if (!matchesDateRange(exchange.occurredAt, input.occurredFrom, input.occurredTo)) {
              return false;
            }
            if (!search) {
              return true;
            }
            return [exchange.subject, exchange.body, exchange.externalMessageId, exchange.threadId].some((value) => value?.toLowerCase().includes(search));
          })
          .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
      },
      async listTimeline(input) {
        return exchanges
          .filter((exchange) => {
            if (exchange.userId !== input.userId) {
              return false;
            }
            if (!input.includeDeleted && exchange.deletedAt) {
              return false;
            }
            if (input.ticketId) {
              return exchange.ticketId === input.ticketId;
            }
            if (input.projectId) {
              return exchange.projectId === input.projectId;
            }
            if (input.clientId) {
              return exchange.clientId === input.clientId;
            }
            return true;
          })
          .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
      },
      async update(input) {
        const current = exchanges.find((exchange) => exchange.userId === input.userId && exchange.id === input.id);
        if (!current) {
          return undefined;
        }
        if (input.fields.clientId !== undefined || input.fields.projectId !== undefined || input.fields.ticketId !== undefined) {
          validateActiveExchangeParents({
            clients,
            projects,
            tickets,
            userId: input.userId,
            clientId: input.fields.clientId === undefined ? current.clientId : input.fields.clientId,
            projectId: input.fields.projectId === undefined ? current.projectId : input.fields.projectId,
            ticketId: input.fields.ticketId === undefined ? current.ticketId : input.fields.ticketId,
          });
        }
        if (input.fields.syncedEmailAccountId) {
          await requireActiveEmailAccount(options.isActiveEmailAccount, input.userId, input.fields.syncedEmailAccountId);
        }
        return updateById(exchanges, input.userId, input.id, (exchange) => ({
          ...exchange,
          ...input.fields,
          updatedAt: input.now,
          clientId: input.fields.clientId === undefined ? exchange.clientId : input.fields.clientId,
          projectId: input.fields.projectId === undefined ? exchange.projectId : input.fields.projectId,
          ticketId: input.fields.ticketId === undefined ? exchange.ticketId : input.fields.ticketId,
          subject: input.fields.subject === undefined ? exchange.subject : input.fields.subject,
          occurredAt: input.fields.occurredAt === undefined ? exchange.occurredAt : input.fields.occurredAt,
          externalMessageId: input.fields.externalMessageId === undefined ? exchange.externalMessageId : input.fields.externalMessageId,
          syncedEmailAccountId: input.fields.syncedEmailAccountId === undefined ? exchange.syncedEmailAccountId : input.fields.syncedEmailAccountId,
          syncedEmailMailbox: input.fields.syncedEmailMailbox === undefined ? exchange.syncedEmailMailbox : input.fields.syncedEmailMailbox,
          syncedEmailUid: input.fields.syncedEmailUid === undefined ? exchange.syncedEmailUid : input.fields.syncedEmailUid,
          threadId: input.fields.threadId === undefined ? exchange.threadId : input.fields.threadId,
        }));
      },
      async setDeletedAt(input) {
        return updateById(exchanges, input.userId, input.id, (exchange) => ({ ...exchange, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
    },
    tags: {
      async create(input) {
        assertTagNameAvailable(tags, input.userId, input.fields.name);
        const record: TagRecord = {
          id: input.id,
          userId: input.userId,
          name: input.fields.name,
          color: input.fields.color ?? null,
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        tags.push(record);
        return record;
      },
      async list(input) {
        return tags.filter((tag) => tag.userId === input.userId && (input.includeDeleted || !tag.deletedAt));
      },
      async update(input) {
        if (input.fields.name !== undefined) {
          assertTagNameAvailable(tags, input.userId, input.fields.name, input.id);
        }
        return updateById(tags, input.userId, input.id, (tag) => ({
          ...tag,
          ...input.fields,
          color: input.fields.color === undefined ? tag.color : input.fields.color,
          metadata: input.fields.metadata ?? tag.metadata,
          updatedAt: input.now,
        }));
      },
      async setDeletedAt(input) {
        return updateById(tags, input.userId, input.id, (tag) => ({ ...tag, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
      async getById(input) {
        return tags.find((tag) => tag.userId === input.userId && tag.id === input.id);
      },
    },
    entityTags: {
      async attach(input) {
        const existing = entityTags.find((entityTag) => matchesEntityTag(entityTag, input));
        if (existing) {
          return existing;
        }
        const record: EntityTagRecord = {
          userId: input.userId,
          tagId: input.tagId,
          entityType: input.entityType,
          entityId: input.entityId,
          createdAt: input.now,
          updatedAt: input.now,
        };
        entityTags.push(record);
        return record;
      },
      async detach(input) {
        const index = entityTags.findIndex((entityTag) => matchesEntityTag(entityTag, input));
        if (index === -1) {
          return false;
        }
        entityTags.splice(index, 1);
        return true;
      },
      async listForEntity(input) {
        return entityTags.filter((entityTag) => entityTag.userId === input.userId && entityTag.entityType === input.entityType && entityTag.entityId === input.entityId);
      },
    },
    attachments: {
      async create(input) {
        const record: AttachmentRecord = {
          id: input.id,
          userId: input.userId,
          targetType: input.fields.targetType,
          targetId: input.fields.targetId,
          storageBackend: input.fields.storageBackend,
          storageKey: input.fields.storageKey,
          fileName: input.fields.fileName,
          contentType: input.fields.contentType ?? null,
          byteSize: input.fields.byteSize,
          checksum: input.fields.checksum ?? null,
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        attachments.push(record);
        return record;
      },
      async createWithinUserQuota(input) {
        const usedBytes = attachments.reduce((total, attachment) => (attachment.userId === input.userId && !attachment.deletedAt ? total + attachment.byteSize : total), 0);
        if (usedBytes + input.fields.byteSize > input.userQuotaBytes) {
          return undefined;
        }
        const record: AttachmentRecord = {
          id: input.id,
          userId: input.userId,
          targetType: input.fields.targetType,
          targetId: input.fields.targetId,
          storageBackend: input.fields.storageBackend,
          storageKey: input.fields.storageKey,
          fileName: input.fields.fileName,
          contentType: input.fields.contentType ?? null,
          byteSize: input.fields.byteSize,
          checksum: input.fields.checksum ?? null,
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        attachments.push(record);
        return record;
      },
      async listForTarget(input) {
        return attachments.filter((attachment) => attachment.userId === input.userId && attachment.targetType === input.targetType && attachment.targetId === input.targetId && (input.includeDeleted || !attachment.deletedAt));
      },
      async sumByteSizeForUser(input) {
        return attachments.reduce((total, attachment) => (attachment.userId === input.userId && !attachment.deletedAt ? total + attachment.byteSize : total), 0);
      },
    },
    notifications: {
      async create(input) {
        const record: NotificationRecord = {
          id: input.id,
          userId: input.userId,
          title: input.fields.title,
          body: input.fields.body ?? null,
          type: input.fields.type ?? "info",
          readAt: null,
          entityType: input.fields.entityType ?? null,
          entityId: input.fields.entityId ?? null,
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
        };
        notifications.push(record);
        return record;
      },
      async list(input) {
        const limit = input.limit ?? 50;
        return notifications
          .filter((notification) => notification.userId === input.userId && (!input.unreadOnly || !notification.readAt))
          .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, limit);
      },
      async listAll(input) {
        return notifications.filter((notification) => notification.userId === input.userId && (!input.unreadOnly || !notification.readAt)).toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      },
      async markRead(input) {
        return updateById(notifications, input.userId, input.id, (notification) => ({ ...notification, readAt: input.now, updatedAt: input.now }));
      },
    },
    userSettings: {
      async getByUserId(input) {
        return userSettings.find((settings) => settings.userId === input.userId);
      },
      async upsert(input) {
        const existing = userSettings.find((settings) => settings.userId === input.userId);
        if (existing) {
          const updated: UserSettingsRecord = {
            ...existing,
            ...input.fields,
            updatedAt: input.now,
          };
          const index = userSettings.findIndex((settings) => settings.userId === input.userId);
          userSettings[index] = updated;
          return updated;
        }
        const record: UserSettingsRecord = {
          id: input.id,
          userId: input.userId,
          locale: input.fields.locale ?? "en",
          theme: input.fields.theme ?? "system",
          onboardingCompleted: input.fields.onboardingCompleted ?? false,
          preferences: input.fields.preferences ?? {},
          createdAt: input.now,
          updatedAt: input.now,
        };
        userSettings.push(record);
        return record;
      },
    },
  };
}

function updateById<TRecord extends { readonly id: string; readonly userId: string }>(
  records: TRecord[],
  userId: string,
  id: string,
  updater: (record: TRecord) => TRecord | undefined,
): TRecord | undefined {
  const index = records.findIndex((record) => record.userId === userId && record.id === id);
  const record = records[index];
  if (!record) {
    return undefined;
  }
  const updated = updater(record);
  if (!updated) {
    return undefined;
  }
  records[index] = updated;
  return updated;
}

function matchesEntityTag(record: EntityTagRecord, input: EntityTagInput): boolean {
  return record.userId === input.userId && record.tagId === input.tagId && record.entityType === input.entityType && record.entityId === input.entityId;
}

function assertTagNameAvailable(records: readonly TagRecord[], userId: string, name: string, exceptId?: string): void {
  const duplicate = records.find((tag) => tag.userId === userId && tag.name === name && tag.id !== exceptId);
  if (duplicate) {
    throw new DuplicateTagNameError(name);
  }
}

function requireActiveClient(records: readonly ClientRecord[], userId: string, clientId: string): ClientRecord {
  const client = records.find((candidate) => candidate.userId === userId && candidate.id === clientId && !candidate.deletedAt);
  if (!client) {
    throw new Error("Client not found.");
  }
  return client;
}

function requireActiveProject(records: readonly ProjectRecord[], clientRecords: readonly ClientRecord[], userId: string, projectId: string): ProjectRecord {
  const project = records.find((candidate) => candidate.userId === userId && candidate.id === projectId && !candidate.deletedAt);
  if (!project) {
    throw new Error("Project not found.");
  }
  requireActiveClient(clientRecords, userId, project.clientId);
  return project;
}

function hasActiveTicketProject(records: readonly ProjectRecord[], clientRecords: readonly ClientRecord[], userId: string, projectId: string): boolean {
  const project = records.find((candidate) => candidate.userId === userId && candidate.id === projectId && !candidate.deletedAt);
  return Boolean(project && clientRecords.some((candidate) => candidate.userId === userId && candidate.id === project.clientId && !candidate.deletedAt));
}

function hasActiveTicketExchanges(records: readonly ExchangeRecord[], userId: string, ticketId: string): boolean {
  return records.some((exchange) => exchange.userId === userId && exchange.ticketId === ticketId && !exchange.deletedAt);
}

function requireActiveTicket(records: readonly TicketRecord[], projectRecords: readonly ProjectRecord[], clientRecords: readonly ClientRecord[], userId: string, ticketId: string): TicketRecord {
  const ticket = records.find((candidate) => candidate.userId === userId && candidate.id === ticketId && !candidate.deletedAt);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  requireActiveProject(projectRecords, clientRecords, userId, ticket.projectId);
  return ticket;
}

function validateActiveExchangeParents(input: {
  readonly clients: readonly ClientRecord[];
  readonly projects: readonly ProjectRecord[];
  readonly tickets: readonly TicketRecord[];
  readonly userId: string;
  readonly clientId: string | null | undefined;
  readonly projectId: string | null | undefined;
  readonly ticketId: string | null | undefined;
}): void {
  if (input.ticketId) {
    const ticket = requireActiveTicket(input.tickets, input.projects, input.clients, input.userId, input.ticketId);
    const project = requireActiveProject(input.projects, input.clients, input.userId, ticket.projectId);
    const client = requireActiveClient(input.clients, input.userId, project.clientId);
    if (input.projectId && input.projectId !== project.id) {
      throw new Error("Exchange project does not match ticket project.");
    }
    if (input.clientId && input.clientId !== client.id) {
      throw new Error("Exchange client does not match project client.");
    }
    return;
  }
  if (input.projectId) {
    const project = requireActiveProject(input.projects, input.clients, input.userId, input.projectId);
    const client = requireActiveClient(input.clients, input.userId, project.clientId);
    if (input.clientId && input.clientId !== client.id) {
      throw new Error("Exchange client does not match project client.");
    }
    return;
  }
  if (input.clientId) {
    requireActiveClient(input.clients, input.userId, input.clientId);
  }
}

async function requireActiveEmailAccount(lookup: ActiveEmailAccountLookup | undefined, userId: string, emailAccountId: string): Promise<void> {
  const exists = lookup ? await lookup({ userId, emailAccountId }) : false;
  if (!exists) {
    throw new Error("Email account not found.");
  }
}

function matchesTagFilter(records: readonly EntityTagRecord[], userId: string, entityType: EntityTagRecord["entityType"], entityId: string, tagIds: readonly string[] | undefined): boolean {
  if (!tagIds || tagIds.length === 0) {
    return true;
  }
  return tagIds.every((tagId) => records.some((record) => record.userId === userId && record.entityType === entityType && record.entityId === entityId && record.tagId === tagId));
}

function assertAuthorizedEmailPatternAvailable(records: readonly ClientAuthorizedEmailRecord[], userId: string, clientId: string, pattern: string): void {
  const normalizedPattern = normalizeAuthorizedEmailPattern(pattern);
  const overlap = records.find((record) => record.userId === userId && record.clientId !== clientId && authorizedEmailPatternsOverlap(record.pattern, normalizedPattern));
  if (overlap) {
    throw new Error("Authorized sender pattern overlaps another client.");
  }
}

function compareClientAuthorizedEmails(left: ClientAuthorizedEmailRecord, right: ClientAuthorizedEmailRecord): number {
  const patternOrder = left.pattern.localeCompare(right.pattern);
  if (patternOrder !== 0) {
    return patternOrder;
  }
  const createdOrder = left.createdAt.getTime() - right.createdAt.getTime();
  if (createdOrder !== 0) {
    return createdOrder;
  }
  return left.id.localeCompare(right.id);
}

class UniqueConstraintError extends Error {
  readonly code = "23505";

  constructor(readonly constraint: string) {
    super(`Unique constraint failed: ${constraint}`);
  }
}

function matchesDateRange(value: Date, from: Date | undefined, to: Date | undefined): boolean {
  if (from && value < from) {
    return false;
  }
  if (to && value > to) {
    return false;
  }
  return true;
}
