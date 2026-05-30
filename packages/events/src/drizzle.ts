import { createDb } from "@DCRM/db";
import { events } from "@DCRM/db/schema/automation-integrations";
import { CRM_ENTITY_TYPES } from "@DCRM/domain";
import { desc, eq } from "drizzle-orm";

import { CORE_EVENT_DEFINITIONS } from "./index.js";

import type { CoreEventType, DcrmEvent, EventChanges, EventEntityReference, EventRepository, JsonObject } from "./index.js";

type EventDatabase = ReturnType<typeof createDb>;
type EventRow = typeof events.$inferSelect;

/** Creates the production event repository backed by the Drizzle events table. */
export function createDrizzleEventRepository(database: EventDatabase = createDb()): EventRepository {
  return {
    async insert(event) {
      const rows = await database
        .insert(events)
        .values({
          id: event.id,
          userId: event.userId,
          type: event.type,
          source: event.source,
          entityType: event.entity?.type,
          entityId: event.entity?.id,
          payload: event.payload,
          changes: event.changes ? eventChangesToJsonObject(event.changes) : undefined,
          metadata: event.metadata,
          createdAt: event.createdAt,
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error("Event could not be persisted.");
      }
      return rowToEvent(row);
    },
    async listForUser(userId) {
      const rows = await database.select().from(events).where(eq(events.userId, userId)).orderBy(desc(events.createdAt));
      return rows.map(rowToEvent);
    },
  };
}

function rowToEvent(row: EventRow): DcrmEvent {
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

function eventChangesToJsonObject(changes: EventChanges): JsonObject {
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
  if (isCrmEntityType(entityType)) {
    return { type: entityType, id: entityId };
  }
  throw new Error(`Unknown persisted event entity type: ${entityType}`);
}

function isCoreEventType(value: string): value is CoreEventType {
  return CORE_EVENT_DEFINITIONS.some((definition) => definition.type === value);
}

function isCrmEntityType(value: string): value is EventEntityReference["type"] {
  return CRM_ENTITY_TYPES.some((type) => type === value);
}
