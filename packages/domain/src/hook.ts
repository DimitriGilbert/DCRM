import { z } from "zod";

// --- Hook Types ---

export const HOOK_TYPES = {
  AI: "ai",
  OUTGOING_WEBHOOK: "outgoing_webhook",
  BUILT_IN: "built_in",
} as const;

export type HookTypeKey = keyof typeof HOOK_TYPES;

export type HookType = (typeof HOOK_TYPES)[HookTypeKey];

export const HOOK_TYPE_VALUES: readonly HookType[] =
  Object.values(HOOK_TYPES);

export const hookTypeSchema = z.enum([
  HOOK_TYPES.AI,
  HOOK_TYPES.OUTGOING_WEBHOOK,
  HOOK_TYPES.BUILT_IN,
]);

// --- Hook Write Behaviors ---

export const HOOK_WRITE_BEHAVIORS = {
  PROPOSE_FIRST: "propose_first",
  DIRECT_WRITE: "direct_write",
} as const;

export type HookWriteBehaviorKey = keyof typeof HOOK_WRITE_BEHAVIORS;

export type HookWriteBehavior = (typeof HOOK_WRITE_BEHAVIORS)[HookWriteBehaviorKey];

export const HOOK_WRITE_BEHAVIOR_VALUES: readonly HookWriteBehavior[] =
  Object.values(HOOK_WRITE_BEHAVIORS);

export const hookWriteBehaviorSchema = z.enum([
  HOOK_WRITE_BEHAVIORS.PROPOSE_FIRST,
  HOOK_WRITE_BEHAVIORS.DIRECT_WRITE,
]);

// --- Hook Execution Statuses ---

export const HOOK_EXECUTION_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
} as const;

export type HookExecutionStatusKey = keyof typeof HOOK_EXECUTION_STATUSES;

export type HookExecutionStatus = (typeof HOOK_EXECUTION_STATUSES)[HookExecutionStatusKey];

export const HOOK_EXECUTION_STATUS_VALUES: readonly HookExecutionStatus[] =
  Object.values(HOOK_EXECUTION_STATUSES);

export const hookExecutionStatusSchema = z.enum([
  HOOK_EXECUTION_STATUSES.PENDING,
  HOOK_EXECUTION_STATUSES.RUNNING,
  HOOK_EXECUTION_STATUSES.SUCCESS,
  HOOK_EXECUTION_STATUSES.FAILED,
]);
