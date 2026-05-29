import { randomUUID } from "node:crypto";

import type { EventSource, EventType } from "./event-types";
import type { ProvenanceMeta } from "./provenance";

/**
 * Normalized DCRM event shape returned after persistence.
 */
export type DcrmEvent = {
  readonly id: string;
  readonly type: EventType;
  readonly userId: string;
  readonly source: EventSource;
  readonly entity?: { readonly type: string; readonly id: string };
  readonly payload: Record<string, unknown>;
  readonly changes?: {
    readonly before?: Record<string, unknown>;
    readonly after?: Record<string, unknown>;
  };
  readonly provenance?: ProvenanceMeta;
  readonly createdAt: Date;
};

/**
 * Input required to emit a DCRM event.
 */
export type EmitEventInput = {
  readonly type: EventType;
  readonly userId: string;
  readonly source: EventSource;
  readonly entity?: { readonly type: string; readonly id: string };
  readonly payload: Record<string, unknown>;
  readonly changes?: {
    readonly before?: Record<string, unknown>;
    readonly after?: Record<string, unknown>;
  };
  readonly provenance?: ProvenanceMeta;
};

/**
 * Row shape matching the DB events table columns.
 */
export type EventRow = {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly source: EventSource;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly payload: Record<string, unknown>;
  readonly changes?: {
    readonly before?: Record<string, unknown>;
    readonly after?: Record<string, unknown>;
  };
};

/**
 * Abstraction over the database persistence layer.
 * The events package does not depend on drizzle-orm directly;
 * callers provide an inserter wired to their DB instance.
 */
export type EventPersister = {
  readonly insert: (row: EventRow) => Promise<void>;
};

/**
 * Emits a typed event by persisting it through the provided persister.
 * Returns the normalized DcrmEvent shape.
 */
export async function emitEvent(
  persister: EventPersister,
  input: EmitEventInput,
): Promise<DcrmEvent> {
  const id = randomUUID();

  const row: EventRow = {
    id,
    userId: input.userId,
    type: input.type,
    source: input.source,
    entityType: input.entity?.type ?? null,
    entityId: input.entity?.id ?? null,
    payload: input.payload,
    changes: input.changes,
  };

  await persister.insert(row);

  return {
    id,
    type: input.type,
    userId: input.userId,
    source: input.source,
    entity: input.entity,
    payload: input.payload,
    changes: input.changes,
    provenance: input.provenance,
    createdAt: new Date(),
  };
}
