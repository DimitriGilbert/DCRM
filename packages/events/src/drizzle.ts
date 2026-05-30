import { createDb } from "@DCRM/db";
import { events } from "@DCRM/db/schema/automation-integrations";
import { desc, eq } from "drizzle-orm";

import { eventChangesToJsonObject, persistedEventRowToEvent } from "./event-drizzle-mapping.js";

import type { EventRepository } from "./index.js";

type EventDatabase = ReturnType<typeof createDb>;

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
      return persistedEventRowToEvent(row);
    },
    async listForUser(userId) {
      const rows = await database.select().from(events).where(eq(events.userId, userId)).orderBy(desc(events.createdAt));
      return rows.map(persistedEventRowToEvent);
    },
  };
}
