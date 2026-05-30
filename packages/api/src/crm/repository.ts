import type {
  ClientIdInput,
  ClientListInput,
  ClientMutationFields,
  ClientRecord,
  ClientUpdateFields,
  EntityTagInput,
  EntityTagRecord,
  ExchangeIdInput,
  ExchangeMutationFields,
  ExchangeRecord,
  ExchangeTimelineInput,
  ExchangeUpdateFields,
  LeadIdInput,
  LeadListInput,
  LeadMutationFields,
  LeadRecord,
  LeadUpdateFields,
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
} from "./types.js";

export type CrmRepository = {
  readonly clients: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: ClientMutationFields; readonly now: Date }) => Promise<ClientRecord>;
    readonly getById: (input: ClientIdInput) => Promise<ClientRecord | undefined>;
    readonly list: (input: ClientListInput) => Promise<readonly ClientRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: ClientUpdateFields; readonly now: Date }) => Promise<ClientRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<ClientRecord | undefined>;
  };
  readonly leads: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: LeadMutationFields; readonly now: Date }) => Promise<LeadRecord>;
    readonly getById: (input: LeadIdInput) => Promise<LeadRecord | undefined>;
    readonly list: (input: LeadListInput) => Promise<readonly LeadRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: LeadUpdateFields; readonly now: Date }) => Promise<LeadRecord | undefined>;
    readonly setDeletedAt: (input: { readonly userId: string; readonly id: string; readonly deletedAt: Date | null; readonly now: Date }) => Promise<LeadRecord | undefined>;
    readonly convert: (input: { readonly userId: string; readonly leadId: string; readonly clientId: string; readonly now: Date }) => Promise<{ readonly lead: LeadRecord; readonly client: ClientRecord } | undefined>;
  };
  readonly projects: {
    readonly create: (input: { readonly id: string; readonly userId: string; readonly fields: ProjectMutationFields; readonly now: Date }) => Promise<ProjectRecord>;
    readonly getById: (input: ProjectIdInput) => Promise<ProjectRecord | undefined>;
    readonly list: (input: ProjectListInput) => Promise<readonly ProjectRecord[]>;
    readonly update: (input: { readonly userId: string; readonly id: string; readonly fields: ProjectUpdateFields; readonly now: Date }) => Promise<ProjectRecord | undefined>;
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
};

export function createInMemoryCrmRepository(): CrmRepository {
  const clients: ClientRecord[] = [];
  const leads: LeadRecord[] = [];
  const projects: ProjectRecord[] = [];
  const tickets: TicketRecord[] = [];
  const exchanges: ExchangeRecord[] = [];
  const tags: TagRecord[] = [];
  const entityTags: EntityTagRecord[] = [];

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
          if (!search) {
            return true;
          }
          return [lead.name, lead.email, lead.phone, lead.company, lead.website, lead.notes, lead.source].some((value) => value?.toLowerCase().includes(search));
        });
      },
      async update(input) {
        return updateById(leads, input.userId, input.id, (lead) => ({
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
        }));
      },
      async setDeletedAt(input) {
        return updateById(leads, input.userId, input.id, (lead) => ({ ...lead, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
      async convert(input) {
        const lead = leads.find((candidate) => candidate.userId === input.userId && candidate.id === input.leadId && !candidate.deletedAt && !candidate.convertedAt);
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
          if (!search) {
            return true;
          }
          return [project.name, project.description].some((value) => value?.toLowerCase().includes(search));
        });
      },
      async update(input) {
        return updateById(projects, input.userId, input.id, (project) => ({
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
        }));
      },
      async setDeletedAt(input) {
        return updateById(projects, input.userId, input.id, (project) => ({ ...project, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
    },
    tickets: {
      async create(input) {
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
          if (!search) {
            return true;
          }
          return [ticket.title, ticket.description].some((value) => value?.toLowerCase().includes(search));
        });
      },
      async update(input) {
        return updateById(tickets, input.userId, input.id, (ticket) => ({
          ...ticket,
          ...input.fields,
          updatedAt: input.now,
          description: input.fields.description === undefined ? ticket.description : input.fields.description,
          dueAt: input.fields.dueAt === undefined ? ticket.dueAt : input.fields.dueAt,
          closedAt: input.fields.closedAt === undefined ? ticket.closedAt : input.fields.closedAt,
        }));
      },
      async setDeletedAt(input) {
        return updateById(tickets, input.userId, input.id, (ticket) => ({ ...ticket, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
    },
    exchanges: {
      async create(input) {
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
          threadId: input.fields.threadId ?? null,
          metadata: input.fields.metadata ?? {},
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        };
        exchanges.push(record);
        return record;
      },
      async getById(input) {
        return exchanges.find((exchange) => exchange.userId === input.userId && exchange.id === input.id);
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
          threadId: input.fields.threadId === undefined ? exchange.threadId : input.fields.threadId,
        }));
      },
      async setDeletedAt(input) {
        return updateById(exchanges, input.userId, input.id, (exchange) => ({ ...exchange, deletedAt: input.deletedAt, updatedAt: input.now }));
      },
    },
    tags: {
      async create(input) {
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
  };
}

function updateById<TRecord extends { readonly id: string; readonly userId: string }>(
  records: TRecord[],
  userId: string,
  id: string,
  updater: (record: TRecord) => TRecord,
): TRecord | undefined {
  const index = records.findIndex((record) => record.userId === userId && record.id === id);
  const record = records[index];
  if (!record) {
    return undefined;
  }
  const updated = updater(record);
  records[index] = updated;
  return updated;
}

function matchesEntityTag(record: EntityTagRecord, input: EntityTagInput): boolean {
  return record.userId === input.userId && record.tagId === input.tagId && record.entityType === input.entityType && record.entityId === input.entityId;
}
