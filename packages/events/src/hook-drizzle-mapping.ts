import type { DownstreamEventBehavior, HookType, HookWriteBehavior } from "@DCRM/domain";

import { isCoreEventType } from "./index.js";

import type { CoreEventType, JsonObject } from "./index.js";
import type { HookSubscription } from "./hooks.js";

export type PersistedHookRuntimeRow = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly eventType: string;
  readonly type: HookType;
  readonly enabled: boolean;
  readonly config: JsonObject;
  readonly outputSchema: JsonObject;
  readonly fieldMapping: JsonObject;
  readonly writeBehavior: HookWriteBehavior;
  readonly downstreamEventBehavior: DownstreamEventBehavior;
};

/** Maps a persisted hook row into the runtime subscription consumed by hook execution. */
export function persistedHookRowToSubscription(row: PersistedHookRuntimeRow): HookSubscription {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    eventType: parseCoreEventType(row.eventType),
    type: row.type,
    enabled: row.enabled,
    config: composePersistedHookRuntimeConfig({
      config: row.config,
      outputSchema: row.outputSchema,
      fieldMapping: row.fieldMapping,
      writeBehavior: row.writeBehavior,
      downstreamEventBehavior: row.downstreamEventBehavior,
    }),
  };
}

function parseCoreEventType(value: string): CoreEventType {
  if (isCoreEventType(value)) {
    return value;
  }
  throw new Error(`Unknown hook event type: ${value}`);
}

function composePersistedHookRuntimeConfig(input: {
  readonly config: JsonObject;
  readonly outputSchema: JsonObject;
  readonly fieldMapping: JsonObject;
  readonly writeBehavior: HookWriteBehavior;
  readonly downstreamEventBehavior: DownstreamEventBehavior;
}): JsonObject {
  return {
    ...input.config,
    outputFields: readJsonArray(input.outputSchema.fields) ?? readJsonArray(input.config.outputFields) ?? [],
    fieldMappings: readJsonArray(input.fieldMapping.mappings) ?? readJsonArray(input.config.fieldMappings) ?? [],
    writeBehavior: input.writeBehavior,
    downstreamEventBehavior: input.downstreamEventBehavior,
  };
}

function readJsonArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
