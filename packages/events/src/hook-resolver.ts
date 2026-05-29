import type { EventType } from "./event-types";

/**
 * Lightweight representation of a hook record returned by the query layer.
 * Mirrors the columns needed for subscription resolution and job dispatch.
 */
export type HookRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly type: string;
  readonly eventType: string;
  readonly enabled: boolean;
  readonly config: Record<string, unknown>;
  readonly maxRetries: number;
};

/**
 * Database query function provided by the caller.
 * The events package stays decoupled from drizzle-orm / specific DB drivers.
 */
export type HookQueryFn = (
  eventType: EventType,
  userId: string,
) => Promise<readonly HookRecord[]>;

/**
 * Resolves hooks subscribed to the given event type for a user.
 * Filters out disabled hooks so callers only receive actionable subscriptions.
 */
export async function resolveHooks(
  queryFn: HookQueryFn,
  eventType: EventType,
  userId: string,
): Promise<readonly HookRecord[]> {
  const hooks = await queryFn(eventType, userId);
  return hooks.filter((hook) => hook.enabled);
}
