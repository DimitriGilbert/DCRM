import type { SupportedLocale } from "@DCRM/i18n";
import type { AttachmentStorageBackend, AttachmentTargetType, CustomFieldType, ExchangeType, ExchangeVisibility, LeadStage, ProjectStatus, TicketPriority, TicketStatus, TicketType, UserThemePreference } from "@DCRM/domain";

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

export type ClientAuthorizedEmailRecord = {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly pattern: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
  readonly syncedEmailAccountId: string | null;
  readonly syncedEmailMailbox: string | null;
  readonly syncedEmailUid: string | null;
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

export type AttachmentRecord = {
  readonly id: string;
  readonly userId: string;
  readonly targetType: AttachmentTargetType;
  readonly targetId: string;
  readonly storageBackend: AttachmentStorageBackend;
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string | null;
  readonly byteSize: number;
  readonly checksum: string | null;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export type NotificationRecord = {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly body: string | null;
  readonly type: string;
  readonly readAt: Date | null;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UserSettingsRecord = {
  readonly id: string;
  readonly userId: string;
  readonly locale: SupportedLocale;
  readonly theme: UserThemePreference;
  readonly onboardingCompleted: boolean;
  readonly preferences: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UserSettingsMutationFields = {
  readonly locale?: SupportedLocale;
  readonly theme?: UserThemePreference;
  readonly onboardingCompleted?: boolean;
  readonly preferences?: JsonObject;
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
  readonly syncedEmailAccountId?: string | null;
  readonly syncedEmailMailbox?: string | null;
  readonly syncedEmailUid?: string | null;
  readonly threadId?: string | null;
  readonly metadata?: JsonObject;
};

export type ExchangeUpdateFields = Partial<ExchangeMutationFields>;

export type AttachmentMutationFields = {
  readonly targetType: AttachmentTargetType;
  readonly targetId: string;
  readonly storageBackend: AttachmentStorageBackend;
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType?: string | null;
  readonly byteSize: number;
  readonly checksum?: string | null;
  readonly metadata?: JsonObject;
};

export type NotificationMutationFields = {
  readonly title: string;
  readonly body?: string | null;
  readonly type?: string;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly metadata?: JsonObject;
};

export type ClientListInput = {
  readonly userId: string;
  readonly search?: string;
  readonly tagIds?: readonly string[];
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
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
  readonly tagIds?: readonly string[];
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
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
  readonly tagIds?: readonly string[];
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
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
  readonly tagIds?: readonly string[];
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
  readonly includeDeleted?: boolean;
  readonly includeInactiveParent?: boolean;
};

export type ExchangeListInput = {
  readonly userId: string;
  readonly search?: string;
  readonly type?: ExchangeType;
  readonly tagIds?: readonly string[];
  readonly occurredFrom?: Date;
  readonly occurredTo?: Date;
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

export type AttachmentTargetInput = {
  readonly userId: string;
  readonly targetType: AttachmentTargetType;
  readonly targetId: string;
  readonly includeDeleted?: boolean;
};
