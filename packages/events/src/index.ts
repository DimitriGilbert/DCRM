import { CRM_ENTITY_TYPES } from "@DCRM/domain";
import type { CrmEntityType, EventAction, EventSource } from "@DCRM/domain";

export type JsonObject = Record<string, unknown>;

export const SYNTHETIC_EVENT_ENTITY_TYPES = ["import", "webhook"] as const;

export type SyntheticEventEntityType = (typeof SYNTHETIC_EVENT_ENTITY_TYPES)[number];

/** Entity reference stored with an event when a meaningful action targets one record. */
export type EventEntityReference = {
  readonly type: CrmEntityType | SyntheticEventEntityType;
  readonly id: string;
};

/** Before/after record snapshots for update-like events. */
export type EventChanges = {
  readonly before?: JsonObject;
  readonly after?: JsonObject;
};

export type EventDefinition = {
  readonly type: string;
  readonly entityType?: EventEntityReference["type"];
  readonly action: EventAction;
  readonly description: string;
};

export const CORE_EVENT_DEFINITIONS = [
  { type: "client.created", entityType: "client", action: "created", description: "A client was created." },
  { type: "client.updated", entityType: "client", action: "updated", description: "A client was updated." },
  { type: "client.deleted", entityType: "client", action: "deleted", description: "A client was soft-deleted." },
  { type: "client.restored", entityType: "client", action: "restored", description: "A client was restored." },
  { type: "tag.created", entityType: "tag", action: "created", description: "A tag was created." },
  { type: "tag.updated", entityType: "tag", action: "updated", description: "A tag was updated." },
  { type: "tag.deleted", entityType: "tag", action: "deleted", description: "A tag was soft-deleted." },
  { type: "tag.restored", entityType: "tag", action: "restored", description: "A tag was restored." },
  { type: "lead.created", entityType: "lead", action: "created", description: "A lead was created." },
  { type: "lead.updated", entityType: "lead", action: "updated", description: "A lead was updated." },
  { type: "lead.deleted", entityType: "lead", action: "deleted", description: "A lead was deleted." },
  { type: "lead.stage_changed", entityType: "lead", action: "stage_changed", description: "A lead moved pipeline stage." },
  { type: "lead.converted", entityType: "lead", action: "converted", description: "A lead was converted into a client." },
  { type: "project.created", entityType: "project", action: "created", description: "A project was created." },
  { type: "project.updated", entityType: "project", action: "updated", description: "A project was updated." },
  { type: "project.deleted", entityType: "project", action: "deleted", description: "A project was deleted." },
  { type: "project.status_changed", entityType: "project", action: "status_changed", description: "A project changed status." },
  { type: "ticket.created", entityType: "ticket", action: "created", description: "A ticket was created." },
  { type: "ticket.updated", entityType: "ticket", action: "updated", description: "A ticket was updated." },
  { type: "ticket.deleted", entityType: "ticket", action: "deleted", description: "A ticket was deleted." },
  { type: "ticket.status_changed", entityType: "ticket", action: "status_changed", description: "A ticket changed status." },
  { type: "exchange.created", entityType: "exchange", action: "created", description: "An exchange was created." },
  { type: "exchange.updated", entityType: "exchange", action: "updated", description: "An exchange was updated." },
  { type: "exchange.deleted", entityType: "exchange", action: "deleted", description: "An exchange was deleted." },
  { type: "exchange.exchange_received", entityType: "exchange", action: "exchange_received", description: "An exchange was received." },
  { type: "attachment.file_attached", entityType: "attachment", action: "file_attached", description: "A file was attached." },
  { type: "import.import_completed", entityType: "import", action: "import_completed", description: "An import completed." },
  { type: "import.import_failed", entityType: "import", action: "import_failed", description: "An import failed after partially or fully processing rows." },
  { type: "webhook.webhook_received", entityType: "webhook", action: "webhook_received", description: "An incoming webhook was received." },
] as const satisfies readonly EventDefinition[];

export type CoreEventType = (typeof CORE_EVENT_DEFINITIONS)[number]["type"];

/** Returns whether a runtime string is one of DCRM's supported core event types. */
export function isCoreEventType(value: string): value is CoreEventType {
  return CORE_EVENT_DEFINITIONS.some((definition) => definition.type === value);
}

/** Returns whether a runtime string is supported as a persisted event entity reference type. */
export function isEventEntityReferenceType(value: string): value is EventEntityReference["type"] {
  return isCrmEntityType(value) || SYNTHETIC_EVENT_ENTITY_TYPES.some((type) => type === value);
}

function isCrmEntityType(value: string): value is CrmEntityType {
  return CRM_ENTITY_TYPES.some((type) => type === value);
}

/** Normalized DCRM event persisted by the event engine. */
export type DcrmEvent = {
  readonly id: string;
  readonly type: CoreEventType;
  readonly userId: string;
  readonly source: EventSource;
  readonly entity?: EventEntityReference;
  readonly payload: JsonObject;
  readonly changes?: EventChanges;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
};

export type EmitEventInput = {
  readonly type: CoreEventType;
  readonly userId: string;
  readonly source: EventSource;
  readonly entity?: EventEntityReference;
  readonly payload?: JsonObject;
  readonly changes?: EventChanges;
  readonly metadata?: JsonObject;
};

export type SourceSpecificEmitEventInput = Omit<EmitEventInput, "source">;

export type EventRepository = {
  readonly insert: (event: DcrmEvent) => Promise<DcrmEvent>;
  readonly listForUser: (userId: string) => Promise<readonly DcrmEvent[]>;
};

export type EventService = {
  readonly emit: (input: EmitEventInput) => Promise<DcrmEvent>;
  readonly emitApp: (input: SourceSpecificEmitEventInput) => Promise<DcrmEvent>;
  readonly emitApi: (input: SourceSpecificEmitEventInput) => Promise<DcrmEvent>;
  readonly emitEmail: (input: SourceSpecificEmitEventInput) => Promise<DcrmEvent>;
  readonly emitWebhook: (input: SourceSpecificEmitEventInput) => Promise<DcrmEvent>;
  readonly emitHook: (input: SourceSpecificEmitEventInput) => Promise<DcrmEvent>;
  readonly emitSystem: (input: SourceSpecificEmitEventInput) => Promise<DcrmEvent>;
  readonly listForUser: (userId: string) => Promise<readonly DcrmEvent[]>;
};

type CreateEventServiceOptions = {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
  readonly repository: EventRepository;
};

/** Creates the public event engine interface for typed emission and user-scoped reads. */
export function createEventService({ clock = () => new Date(), idGenerator = () => crypto.randomUUID(), repository }: CreateEventServiceOptions): EventService {
  const emit = async (input: EmitEventInput) => {
    const event = normalizeEventInput(input, idGenerator(), clock());
    return repository.insert(event);
  };

  return {
    emit,
    emitApp(input) {
      return emit({ ...input, source: "app" });
    },
    emitApi(input) {
      return emit({ ...input, source: "api" });
    },
    emitEmail(input) {
      return emit({ ...input, source: "email" });
    },
    emitWebhook(input) {
      return emit({ ...input, source: "webhook" });
    },
    emitHook(input) {
      return emit({ ...input, source: "hook" });
    },
    emitSystem(input) {
      return emit({ ...input, source: "system" });
    },
    listForUser(userId) {
      return repository.listForUser(userId);
    },
  };
}

/** Creates an in-memory event repository for public-interface tests and local callers. */
export function createInMemoryEventRepository(): EventRepository {
  const events: DcrmEvent[] = [];

  return {
    async insert(event) {
      events.push(event);
      return event;
    },
    async listForUser(userId) {
      return events.filter((event) => event.userId === userId);
    },
  };
}

function normalizeEventInput(input: EmitEventInput, id: string, createdAt: Date): DcrmEvent {
  if (input.userId.trim().length === 0) {
    throw new Error("userId is required for event emission.");
  }

  return {
    id,
    type: input.type,
    userId: input.userId,
    source: input.source,
    ...(input.entity ? { entity: input.entity } : {}),
    payload: input.payload ?? {},
    ...(input.changes ? { changes: input.changes } : {}),
    metadata: input.metadata ?? {},
    createdAt,
  };
}
