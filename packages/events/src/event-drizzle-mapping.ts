import type { EventSource } from "@DCRM/domain";

import { CORE_EVENT_DEFINITIONS, isEventEntityReferenceType } from "./index.js";

import type { CoreEventType, DcrmEvent, EventChanges, EventEntityReference, JsonObject } from "./index.js";

export type PersistedEventRow = {
  readonly id: string;
  readonly type: string;
  readonly userId: string;
  readonly source: EventSource;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly payload: JsonObject;
  readonly changes: JsonObject | null;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
};

/** Maps a persisted Drizzle event row into the public event record shape. */
export function persistedEventRowToEvent(row: PersistedEventRow): DcrmEvent {
  const type = parseCoreEventType(row.type);
  const entity = parseEntityReference(row.entityType, row.entityId);

  return {
    id: row.id,
    type,
    userId: row.userId,
    source: row.source,
    ...(entity ? { entity } : {}),
    payload: row.payload,
    ...(row.changes ? { changes: jsonObjectToEventChanges(row.changes) } : {}),
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

export function eventChangesToJsonObject(changes: EventChanges): JsonObject {
  return {
    ...(changes.before ? { before: changes.before } : {}),
    ...(changes.after ? { after: changes.after } : {}),
  };
}

function jsonObjectToEventChanges(value: JsonObject): EventChanges {
  return {
    ...(isJsonObject(value.before) ? { before: value.before } : {}),
    ...(isJsonObject(value.after) ? { after: value.after } : {}),
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCoreEventType(value: string): CoreEventType {
  if (isCoreEventType(value)) {
    return value;
  }
  throw new Error(`Unknown persisted event type: ${value}`);
}

function parseEntityReference(entityType: string | null, entityId: string | null): EventEntityReference | undefined {
  if (!entityType || !entityId) {
    return undefined;
  }
  if (isEventEntityReferenceType(entityType)) {
    return { type: entityType, id: entityId };
  }
  throw new Error(`Unknown persisted event entity type: ${entityType}`);
}

function isCoreEventType(value: string): value is CoreEventType {
  return CORE_EVENT_DEFINITIONS.some((definition) => definition.type === value);
}
