import type { AttachmentTargetType, CustomFieldType, ExchangeType, ExchangeVisibility, LeadStage, ProjectStatus, TicketPriority, TicketStatus, TicketType } from "@DCRM/domain";

export type JsonObject = Record<string, unknown>;

export type CustomFieldDefinition = {
  readonly key: string;
  readonly label: string;
  readonly type: CustomFieldType;
  readonly required: boolean;
  readonly options?: readonly string[];
};

export type CustomFieldValue = string | number | boolean | null;

export type ClientRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly company: string | null;
  readonly website: string | null;
  readonly notes: string | null;
  readonly socialLinks: JsonObject;
  readonly address: JsonObject;
  readonly customFields: JsonObject;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type TagRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly color: string | null;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type LeadRecord = {
  readonly id: string;
  readonly userId: string;
  readonly convertedClientId: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly company: string | null;
  readonly website: string | null;
  readonly notes: string | null;
  readonly source: string | null;
  readonly stage: LeadStage;
  readonly estimatedValueAmount: string | null;
  readonly estimatedValueCurrency: string | null;
  readonly socialLinks: JsonObject;
  readonly address: JsonObject;
  readonly customFields: JsonObject;
  readonly metadata: JsonObject;
  readonly convertedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type ProjectRecord = {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly budgetAmount: string | null;
  readonly budgetCurrency: string | null;
  readonly estimatedHours: string | null;
  readonly actualHours: string | null;
  readonly startsAt: Date | null;
  readonly dueAt: Date | null;
  readonly completedAt: Date | null;
  readonly customFields: JsonObject;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type TicketRecord = {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly type: TicketType;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly dueAt: Date | null;
  readonly closedAt: Date | null;
  readonly customFields: JsonObject;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type ExchangeRecord = {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string | null;
  readonly projectId: string | null;
  readonly ticketId: string | null;
  readonly type: ExchangeType;
  readonly visibility: ExchangeVisibility;
  readonly subject: string | null;
  readonly body: string;
  readonly occurredAt: Date;
  readonly externalMessageId: string | null;
  readonly threadId: string | null;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type EntityTagRecord = {
  readonly userId: string;
  readonly tagId: string;
  readonly entityType: AttachmentTargetType;
  readonly entityId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ClientMutationFields = {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly company?: string | null;
  readonly website?: string | null;
  readonly notes?: string | null;
  readonly socialLinks?: JsonObject;
  readonly address?: JsonObject;
  readonly customFields?: JsonObject;
  readonly metadata?: JsonObject;
};

export type ClientUpdateFields = Partial<ClientMutationFields>;

export type LeadMutationFields = {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly company?: string | null;
  readonly website?: string | null;
  readonly notes?: string | null;
  readonly source?: string | null;
  readonly stage?: LeadStage;
  readonly estimatedValueAmount?: string | null;
  readonly estimatedValueCurrency?: string | null;
  readonly socialLinks?: JsonObject;
  readonly address?: JsonObject;
  readonly customFields?: JsonObject;
  readonly metadata?: JsonObject;
};

export type LeadUpdateFields = Partial<LeadMutationFields>;

export type ProjectMutationFields = {
  readonly clientId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly status?: ProjectStatus;
  readonly budgetAmount?: string | null;
  readonly budgetCurrency?: string | null;
  readonly estimatedHours?: string | null;
  readonly actualHours?: string | null;
  readonly startsAt?: Date | null;
  readonly dueAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly customFields?: JsonObject;
  readonly metadata?: JsonObject;
};

export type ProjectUpdateFields = Partial<ProjectMutationFields>;

export type TicketMutationFields = {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly type?: TicketType;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly dueAt?: Date | null;
  readonly closedAt?: Date | null;
  readonly customFields?: JsonObject;
  readonly metadata?: JsonObject;
};

export type TicketUpdateFields = Partial<TicketMutationFields>;

export type ExchangeMutationFields = {
  readonly clientId?: string | null;
  readonly projectId?: string | null;
  readonly ticketId?: string | null;
  readonly type: ExchangeType;
  readonly visibility?: ExchangeVisibility;
  readonly subject?: string | null;
  readonly body: string;
  readonly occurredAt?: Date;
  readonly externalMessageId?: string | null;
  readonly threadId?: string | null;
  readonly metadata?: JsonObject;
};

export type ExchangeUpdateFields = Partial<ExchangeMutationFields>;

export type ClientListInput = {
  readonly userId: string;
  readonly search?: string;
  readonly includeDeleted?: boolean;
};

export type ClientIdInput = {
  readonly userId: string;
  readonly id: string;
};

export type LeadListInput = {
  readonly userId: string;
  readonly search?: string;
  readonly stage?: LeadStage;
  readonly includeDeleted?: boolean;
  readonly includeConverted?: boolean;
};

export type LeadIdInput = {
  readonly userId: string;
  readonly id: string;
};

export type ProjectListInput = {
  readonly userId: string;
  readonly clientId?: string;
  readonly search?: string;
  readonly status?: ProjectStatus;
  readonly includeDeleted?: boolean;
};

export type ProjectIdInput = {
  readonly userId: string;
  readonly id: string;
};

export type TicketListInput = {
  readonly userId: string;
  readonly projectId?: string;
  readonly search?: string;
  readonly type?: TicketType;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly includeDeleted?: boolean;
};

export type TicketIdInput = {
  readonly userId: string;
  readonly id: string;
};

export type ExchangeTimelineInput = {
  readonly userId: string;
  readonly clientId?: string;
  readonly projectId?: string;
  readonly ticketId?: string;
  readonly includeDeleted?: boolean;
};

export type ExchangeIdInput = {
  readonly userId: string;
  readonly id: string;
};

export type TagMutationFields = {
  readonly name: string;
  readonly color?: string | null;
  readonly metadata?: JsonObject;
};

export type EntityTagInput = {
  readonly userId: string;
  readonly tagId: string;
  readonly entityType: AttachmentTargetType;
  readonly entityId: string;
};
