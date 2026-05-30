import { Queue, UnrecoverableError, Worker } from "bullmq";
import type { DownstreamEventBehavior, HookExecutionStatus, HookType, HookWriteBehavior } from "@DCRM/domain";
import type { JobsOptions, QueueOptions, WorkerOptions } from "bullmq";

import type { CoreEventType, DcrmEvent, EventService, JsonObject, SourceSpecificEmitEventInput } from "./index.js";

export type RetryBackoffType = "fixed" | "exponential";

export type HookRetryPolicy = {
  readonly maxAttempts: number;
  readonly backoff: {
    readonly type: RetryBackoffType;
    readonly delayMs: number;
  };
};

export type HookSubscription = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly eventType: CoreEventType;
  readonly type: HookType;
  readonly enabled: boolean;
  readonly config: JsonObject;
};

export type HookExecutionRecord = {
  readonly id: string;
  readonly userId: string;
  readonly hookId: string;
  readonly eventId: string;
  readonly status: HookExecutionStatus;
  readonly input: JsonObject;
  readonly output?: JsonObject;
  readonly error?: JsonObject;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly retryMetadata: JsonObject;
  readonly queuedAt: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly nextRetryAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type HookExecutionJobData = {
  readonly executionId: string;
};

export type HookExecutionJobResult = {
  readonly executionId: string;
  readonly status: "success";
};

export type HookRepository = {
  readonly listEnabledForEvent: (input: { readonly userId: string; readonly eventType: CoreEventType }) => Promise<readonly HookSubscription[]>;
  readonly getById: (hookId: string) => Promise<HookSubscription | undefined>;
};

export type CreateHookExecutionInput = {
  readonly id: string;
  readonly event: DcrmEvent;
  readonly hook: HookSubscription;
  readonly retryPolicy: HookRetryPolicy;
  readonly queuedAt: Date;
};

export type HookExecutionRepository = {
  readonly createPending: (input: CreateHookExecutionInput) => Promise<HookExecutionRecord>;
  readonly markRunning: (input: { readonly executionId: string; readonly startedAt: Date; readonly attempt: number }) => Promise<HookExecutionRecord>;
  readonly markSuccess: (input: { readonly executionId: string; readonly output: JsonObject; readonly finishedAt: Date }) => Promise<HookExecutionRecord>;
  readonly markFailed: (input: {
    readonly executionId: string;
    readonly error: JsonObject;
    readonly finishedAt: Date;
    readonly nextRetryAt?: Date;
  }) => Promise<HookExecutionRecord>;
  readonly getById: (executionId: string) => Promise<HookExecutionRecord | undefined>;
  readonly listForEvent: (eventId: string) => Promise<readonly HookExecutionRecord[]>;
};

export type EnqueueHookExecutionOptions = {
  readonly retryPolicy: HookRetryPolicy;
};

export type HookExecutionQueue = {
  readonly enqueue: (job: HookExecutionJobData, options: EnqueueHookExecutionOptions) => Promise<void>;
};

export type HookExecutionContext = {
  readonly event: DcrmEvent;
  readonly hook: HookSubscription;
  readonly execution: HookExecutionRecord;
  readonly attempt: number;
};

export type HookDownstreamEventPolicy = "suppress_hooks" | "emit_hooks";

export type HookWriteProvenance = {
  readonly source: "hook";
  readonly hookId: string;
  readonly hookExecutionId: string;
  readonly triggeringEventId: string;
};

export type HookWriteContext = {
  readonly provenance: HookWriteProvenance;
  readonly downstreamEventPolicy: HookDownstreamEventPolicy;
};

export type CreateHookWriteContextOptions = {
  readonly downstreamEventPolicy?: HookDownstreamEventPolicy;
};

export type EmitHookWriteEventInput = {
  readonly eventService: EventService;
  readonly context: HookExecutionContext;
  readonly event: SourceSpecificEmitEventInput;
  readonly downstreamEventPolicy?: HookDownstreamEventPolicy;
};

export type HookExecutor = {
  readonly execute: (context: HookExecutionContext) => Promise<JsonObject | undefined>;
};

export class NonRetryableHookExecutionError extends Error {
  readonly error: unknown;

  constructor(message: string, error: unknown) {
    super(message);
    this.name = "NonRetryableHookExecutionError";
    this.error = error;
  }
}

type CreateHookAwareEventServiceOptions = {
  readonly eventService: EventService;
  readonly hookRepository: HookRepository;
  readonly executionRepository: HookExecutionRepository;
  readonly queue: HookExecutionQueue;
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
};

type CreateHookExecutionProcessorOptions = {
  readonly eventService: EventService;
  readonly hookRepository: HookRepository;
  readonly executionRepository: HookExecutionRepository;
  readonly executor: HookExecutor;
  readonly clock?: () => Date;
};

type BullMqHookExecutionQueueOptions = {
  readonly connection: QueueOptions["connection"];
  readonly queueName?: string;
  readonly defaultJobOptions?: QueueOptions["defaultJobOptions"];
};

type BullMqHookExecutionWorkerOptions = {
  readonly connection: WorkerOptions["connection"];
  readonly processor: (job: HookExecutionJobData, attempt: number) => Promise<HookExecutionJobResult>;
  readonly queueName?: string;
};

const DEFAULT_RETRY_POLICY: HookRetryPolicy = {
  maxAttempts: 1,
  backoff: {
    type: "exponential",
    delayMs: 1_000,
  },
};

const HOOK_EXECUTION_QUEUE_NAME = "dcrm-hook-executions";

/** Creates provenance for writes performed while a hook execution is running. */
export function createHookWriteContext(
  context: HookExecutionContext,
  options: CreateHookWriteContextOptions = {},
): HookWriteContext {
  return {
    provenance: {
      source: "hook",
      hookId: context.hook.id,
      hookExecutionId: context.execution.id,
      triggeringEventId: context.event.id,
    },
    downstreamEventPolicy: options.downstreamEventPolicy ?? "suppress_hooks",
  };
}

/** Emits a hook-driven write event with provenance and default downstream hook suppression. */
export function emitHookWriteEvent({
  eventService,
  context,
  event,
  downstreamEventPolicy,
}: EmitHookWriteEventInput): Promise<DcrmEvent> {
  const writeContext = createHookWriteContext(context, { downstreamEventPolicy });
  return eventService.emitHook({
    ...event,
    metadata: {
      ...event.metadata,
      provenance: writeContext.provenance,
      downstreamEventPolicy: writeContext.downstreamEventPolicy,
    },
  });
}

/** Composes runtime hook config from legacy config JSON and dedicated persisted behavior columns. */
export function composePersistedHookRuntimeConfig(input: {
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

/** Wraps event emission with hook subscription resolution and BullMQ enqueueing. */
export function createHookAwareEventService({
  eventService,
  hookRepository,
  executionRepository,
  queue,
  clock = () => new Date(),
  idGenerator = () => crypto.randomUUID(),
}: CreateHookAwareEventServiceOptions): EventService {
  const emitAndDispatch = async (emit: () => Promise<DcrmEvent>) => {
    const event = await emit();
    if (shouldDispatchDownstreamHooks(event)) {
      await dispatchHookExecutions({ event, hookRepository, executionRepository, queue, clock, idGenerator });
    }
    return event;
  };

  return {
    emit(input) {
      return emitAndDispatch(() => eventService.emit(input));
    },
    emitApp(input) {
      return emitAndDispatch(() => eventService.emitApp(input));
    },
    emitApi(input) {
      return emitAndDispatch(() => eventService.emitApi(input));
    },
    emitEmail(input) {
      return emitAndDispatch(() => eventService.emitEmail(input));
    },
    emitWebhook(input) {
      return emitAndDispatch(() => eventService.emitWebhook(input));
    },
    emitHook(input) {
      return emitAndDispatch(() => eventService.emitHook(input));
    },
    emitSystem(input) {
      return emitAndDispatch(() => eventService.emitSystem(input));
    },
    listForUser(userId) {
      return eventService.listForUser(userId);
    },
  };
}

/** Creates the public processor used by the BullMQ worker to execute one hook execution job. */
export function createHookExecutionProcessor({
  eventService,
  hookRepository,
  executionRepository,
  executor,
  clock = () => new Date(),
}: CreateHookExecutionProcessorOptions) {
  return async (job: HookExecutionJobData, attempt: number): Promise<HookExecutionJobResult> => {
    const execution = await requireExecution(executionRepository, job.executionId);
    let hook: HookSubscription | undefined;

    try {
      hook = await requireHook(hookRepository, execution.hookId);
      const event = await requireEvent(eventService, execution.eventId, execution.userId);
      const running = await executionRepository.markRunning({ executionId: execution.id, startedAt: clock(), attempt });
      const output = await executor.execute({ event, hook, execution: running, attempt });
      await executionRepository.markSuccess({ executionId: execution.id, output: output ?? {}, finishedAt: clock() });
      return { executionId: execution.id, status: "success" };
    } catch (error) {
      const retryPolicy = hook ? resolveRetryPolicy(hook) : executionRecordToRetryPolicy(execution);
      const retryable = isRetryableHookExecutionError(error);
      const nextRetryAt = retryable && attempt < retryPolicy.maxAttempts ? calculateNextRetryAt(clock(), retryPolicy, attempt) : undefined;
      await executionRepository.markFailed({
        executionId: execution.id,
        error: errorToJsonObject(error),
        finishedAt: clock(),
        ...(nextRetryAt ? { nextRetryAt } : {}),
      });
      if (!retryable) {
        throw new UnrecoverableError(errorMessage(error));
      }
      throw error;
    }
  };
}

/** Creates a BullMQ-backed hook execution queue adapter. */
export function createBullMqHookExecutionQueue({
  connection,
  queueName = HOOK_EXECUTION_QUEUE_NAME,
  defaultJobOptions,
}: BullMqHookExecutionQueueOptions): HookExecutionQueue & { readonly close: () => Promise<void> } {
  const queue = new Queue<HookExecutionJobData, HookExecutionJobResult, string>(queueName, { connection, defaultJobOptions });

  return {
    async enqueue(job, options) {
      await queue.add("execute-hook", job, retryPolicyToJobsOptions(options.retryPolicy));
    },
    close() {
      return queue.close();
    },
  };
}

/** Creates a BullMQ worker for hook execution jobs. */
export function createBullMqHookExecutionWorker({
  connection,
  processor,
  queueName = HOOK_EXECUTION_QUEUE_NAME,
}: BullMqHookExecutionWorkerOptions): Worker<HookExecutionJobData, HookExecutionJobResult, string> {
  return new Worker<HookExecutionJobData, HookExecutionJobResult, string>(
    queueName,
    (job) => processor(job.data, job.attemptsMade + 1),
    { connection },
  );
}

/** Creates an in-memory hook repository for public-interface tests and local callers. */
export function createInMemoryHookRepository(initialHooks: readonly HookSubscription[] = []): HookRepository {
  const hooks = [...initialHooks];

  return {
    async listEnabledForEvent(input) {
      return hooks.filter((hook) => hook.userId === input.userId && hook.eventType === input.eventType && hook.enabled);
    },
    async getById(hookId) {
      return hooks.find((hook) => hook.id === hookId);
    },
  };
}

/** Creates an in-memory execution repository for behavior tests and local callers. */
export function createInMemoryHookExecutionRepository(): HookExecutionRepository {
  const records: HookExecutionRecord[] = [];

  return {
    async createPending(input) {
      const retryMetadata = retryPolicyToJsonObject(input.retryPolicy);
      const record: HookExecutionRecord = {
        id: input.id,
        userId: input.event.userId,
        hookId: input.hook.id,
        eventId: input.event.id,
        status: "pending",
        input: eventToJsonObject(input.event),
        attempt: 0,
        maxAttempts: input.retryPolicy.maxAttempts,
        retryMetadata,
        queuedAt: input.queuedAt,
        createdAt: input.queuedAt,
        updatedAt: input.queuedAt,
      };
      records.push(record);
      return record;
    },
    async markRunning(input) {
      return updateRecord(records, input.executionId, (record) => ({
        ...record,
        status: "running",
        attempt: input.attempt,
        startedAt: input.startedAt,
        updatedAt: input.startedAt,
      }));
    },
    async markSuccess(input) {
      return updateRecord(records, input.executionId, (record) => ({
        ...record,
        status: "success",
        output: input.output,
        error: undefined,
        finishedAt: input.finishedAt,
        nextRetryAt: undefined,
        updatedAt: input.finishedAt,
      }));
    },
    async markFailed(input) {
      return updateRecord(records, input.executionId, (record) => ({
        ...record,
        status: "failed",
        error: input.error,
        finishedAt: input.finishedAt,
        nextRetryAt: input.nextRetryAt,
        updatedAt: input.finishedAt,
      }));
    },
    async getById(executionId) {
      return records.find((record) => record.id === executionId);
    },
    async listForEvent(eventId) {
      return records.filter((record) => record.eventId === eventId);
    },
  };
}

/** Records queue jobs at the BullMQ boundary for behavior tests without executing in-process. */
export function createRecordingHookExecutionQueue(): HookExecutionQueue & {
  readonly jobs: HookExecutionJobData[];
  readonly options: EnqueueHookExecutionOptions[];
} {
  const jobs: HookExecutionJobData[] = [];
  const options: EnqueueHookExecutionOptions[] = [];

  return {
    jobs,
    options,
    async enqueue(job, enqueueOptions) {
      jobs.push(job);
      options.push(enqueueOptions);
    },
  };
}

async function dispatchHookExecutions(input: {
  readonly event: DcrmEvent;
  readonly hookRepository: HookRepository;
  readonly executionRepository: HookExecutionRepository;
  readonly queue: HookExecutionQueue;
  readonly clock: () => Date;
  readonly idGenerator: () => string;
}) {
  const hooks = await input.hookRepository.listEnabledForEvent({ userId: input.event.userId, eventType: input.event.type });
  const pendingExecutions = await Promise.all(
    hooks.map((hook) => {
      const retryPolicy = resolveRetryPolicy(hook);
      return input.executionRepository.createPending({
        id: input.idGenerator(),
        event: input.event,
        hook,
        retryPolicy,
        queuedAt: input.clock(),
      });
    }),
  );

  await Promise.all(
    pendingExecutions.map((execution) =>
      input.queue.enqueue({ executionId: execution.id }, { retryPolicy: executionRecordToRetryPolicy(execution) }),
    ),
  );
}

async function requireExecution(repository: HookExecutionRepository, executionId: string): Promise<HookExecutionRecord> {
  const execution = await repository.getById(executionId);
  if (!execution) {
    throw new Error(`Hook execution not found: ${executionId}`);
  }
  return execution;
}

async function requireHook(repository: HookRepository, hookId: string): Promise<HookSubscription> {
  const hook = await repository.getById(hookId);
  if (!hook) {
    throw new NonRetryableHookExecutionError(`Hook subscription not found: ${hookId}`, { hookId });
  }
  return hook;
}

async function requireEvent(eventService: EventService, eventId: string, userId: string): Promise<DcrmEvent> {
  const events = await eventService.listForUser(userId);
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) {
    throw new NonRetryableHookExecutionError(`Event not found for hook execution: ${eventId}`, { eventId, userId });
  }
  return event;
}

function updateRecord(
  records: HookExecutionRecord[],
  executionId: string,
  updater: (record: HookExecutionRecord) => HookExecutionRecord,
): HookExecutionRecord {
  const index = records.findIndex((record) => record.id === executionId);
  const current = records[index];
  if (!current) {
    throw new Error(`Hook execution not found: ${executionId}`);
  }
  const updated = updater(current);
  records[index] = updated;
  return updated;
}

function resolveRetryPolicy(hook: HookSubscription): HookRetryPolicy {
  const value = hook.config.retryPolicy;
  if (!isJsonObject(value)) {
    return DEFAULT_RETRY_POLICY;
  }

  const maxAttempts = typeof value.maxAttempts === "number" && Number.isInteger(value.maxAttempts) && value.maxAttempts > 0 ? value.maxAttempts : 1;
  const backoff = isJsonObject(value.backoff) ? value.backoff : {};
  const type = backoff.type === "fixed" || backoff.type === "exponential" ? backoff.type : DEFAULT_RETRY_POLICY.backoff.type;
  const delayMs = typeof backoff.delayMs === "number" && Number.isFinite(backoff.delayMs) && backoff.delayMs >= 0 ? backoff.delayMs : DEFAULT_RETRY_POLICY.backoff.delayMs;

  return { maxAttempts, backoff: { type, delayMs } };
}

function executionRecordToRetryPolicy(execution: HookExecutionRecord): HookRetryPolicy {
  const type = execution.retryMetadata.backoffType === "fixed" || execution.retryMetadata.backoffType === "exponential" ? execution.retryMetadata.backoffType : DEFAULT_RETRY_POLICY.backoff.type;
  const delayMs = typeof execution.retryMetadata.backoffDelayMs === "number" ? execution.retryMetadata.backoffDelayMs : DEFAULT_RETRY_POLICY.backoff.delayMs;

  return {
    maxAttempts: execution.maxAttempts,
    backoff: { type, delayMs },
  };
}

function retryPolicyToJobsOptions(retryPolicy: HookRetryPolicy): JobsOptions {
  return {
    attempts: retryPolicy.maxAttempts,
    backoff: {
      type: retryPolicy.backoff.type,
      delay: retryPolicy.backoff.delayMs,
    },
    removeOnComplete: false,
    removeOnFail: false,
  };
}

function retryPolicyToJsonObject(retryPolicy: HookRetryPolicy): JsonObject {
  return {
    backoffType: retryPolicy.backoff.type,
    backoffDelayMs: retryPolicy.backoff.delayMs,
  };
}

function calculateNextRetryAt(failedAt: Date, retryPolicy: HookRetryPolicy, attempt: number): Date {
  const multiplier = retryPolicy.backoff.type === "exponential" ? 2 ** Math.max(attempt - 1, 0) : 1;
  return new Date(failedAt.getTime() + retryPolicy.backoff.delayMs * multiplier);
}

function shouldDispatchDownstreamHooks(event: DcrmEvent): boolean {
  return event.source !== "hook" || event.metadata.downstreamEventPolicy === "emit_hooks";
}

function eventToJsonObject(event: DcrmEvent): JsonObject {
  return {
    id: event.id,
    type: event.type,
    userId: event.userId,
    source: event.source,
    ...(event.entity ? { entity: event.entity } : {}),
    payload: event.payload,
    ...(event.changes ? { changes: event.changes } : {}),
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  };
}

function errorToJsonObject(error: unknown): JsonObject {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    message: "Unknown hook execution error.",
  };
}

function isRetryableHookExecutionError(error: unknown): boolean {
  return !(error instanceof NonRetryableHookExecutionError);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Non-retryable hook execution failure.";
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
