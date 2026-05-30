import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "./index.js";
import {
  createHookExecutionProcessor,
  createHookAwareEventService,
  emitHookWriteEvent,
  createInMemoryHookExecutionRepository,
  createInMemoryHookRepository,
  createRecordingHookExecutionQueue,
} from "./hooks.js";

describe("hook subscriptions", () => {
  it("creates and enqueues one pending execution for every enabled hook subscribed to an emitted event", async () => {
    const baseEvents = createEventService({
      clock: () => new Date("2026-05-30T12:00:00.000Z"),
      idGenerator: createSequentialIdGenerator("event"),
      repository: createInMemoryEventRepository(),
    });
    const hooks = createInMemoryHookRepository([
      { id: "hook_1", userId: "user_1", name: "First", eventType: "client.created", type: "built_in", enabled: true, config: {} },
      { id: "hook_2", userId: "user_1", name: "Second", eventType: "client.created", type: "built_in", enabled: true, config: {} },
      { id: "hook_3", userId: "user_1", name: "Disabled", eventType: "client.created", type: "built_in", enabled: false, config: {} },
      { id: "hook_4", userId: "user_2", name: "Other user", eventType: "client.created", type: "built_in", enabled: true, config: {} },
    ]);
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const service = createHookAwareEventService({
      eventService: baseEvents,
      hookRepository: hooks,
      executionRepository: executions,
      queue,
      clock: () => new Date("2026-05-30T12:01:00.000Z"),
      idGenerator: createSequentialIdGenerator("execution"),
    });

    const event = await service.emitApp({ type: "client.created", userId: "user_1" });

    const records = await executions.listForEvent(event.id);
    assert.deepEqual(
      records.map((record) => ({ hookId: record.hookId, status: record.status })),
      [
        { hookId: "hook_1", status: "pending" },
        { hookId: "hook_2", status: "pending" },
      ],
    );
    assert.deepEqual(
      queue.jobs.map((job) => job.executionId),
      records.map((record) => record.id),
    );
  });

  it("runs same-event hook executions independently and records failed siblings without blocking successful siblings", async () => {
    const baseEvents = createEventService({
      clock: () => new Date("2026-05-30T12:00:00.000Z"),
      idGenerator: createSequentialIdGenerator("event"),
      repository: createInMemoryEventRepository(),
    });
    const hooks = createInMemoryHookRepository([
      { id: "hook_failing", userId: "user_1", name: "Failing", eventType: "client.created", type: "built_in", enabled: true, config: {} },
      { id: "hook_success", userId: "user_1", name: "Success", eventType: "client.created", type: "built_in", enabled: true, config: {} },
    ]);
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const service = createHookAwareEventService({
      eventService: baseEvents,
      hookRepository: hooks,
      executionRepository: executions,
      queue,
      idGenerator: createSequentialIdGenerator("execution"),
    });
    const processor = createHookExecutionProcessor({
      eventService: service,
      hookRepository: hooks,
      executionRepository: executions,
      executor: {
        async execute(context) {
          if (context.hook.id === "hook_failing") {
            throw new Error("Hook failed intentionally.");
          }
          return { ok: true };
        },
      },
      clock: createStepClock("2026-05-30T12:02:00.000Z"),
    });

    const event = await service.emitApp({ type: "client.created", userId: "user_1" });
    const firstJob = queue.jobs[0];
    const secondJob = queue.jobs[1];
    assert.ok(firstJob);
    assert.ok(secondJob);

    await assert.rejects(processor(firstJob, 1), /Hook failed intentionally/u);
    await processor(secondJob, 1);

    assert.deepEqual(
      (await executions.listForEvent(event.id)).map((record) => ({ hookId: record.hookId, status: record.status, output: record.output, error: record.error })),
      [
        { hookId: "hook_failing", status: "failed", output: undefined, error: { name: "Error", message: "Hook failed intentionally." } },
        { hookId: "hook_success", status: "success", output: { ok: true }, error: undefined },
      ],
    );
  });

  it("uses hook retry policy when queueing executions", async () => {
    const baseEvents = createEventService({
      idGenerator: createSequentialIdGenerator("event"),
      repository: createInMemoryEventRepository(),
    });
    const hooks = createInMemoryHookRepository([
      {
        id: "hook_retrying",
        userId: "user_1",
        name: "Retrying hook",
        eventType: "client.created",
        type: "outgoing_webhook",
        enabled: true,
        config: {
          retryPolicy: {
            maxAttempts: 3,
            backoff: {
              type: "fixed",
              delayMs: 2_500,
            },
          },
        },
      },
    ]);
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const service = createHookAwareEventService({
      eventService: baseEvents,
      hookRepository: hooks,
      executionRepository: executions,
      queue,
      idGenerator: createSequentialIdGenerator("execution"),
    });

    await service.emitApp({ type: "client.created", userId: "user_1" });

    assert.deepEqual(queue.options, [
      {
        retryPolicy: {
          maxAttempts: 3,
          backoff: {
            type: "fixed",
            delayMs: 2_500,
          },
        },
      },
    ]);
  });

  it("clears the next retry timestamp after the final failed attempt", async () => {
    const baseEvents = createEventService({
      idGenerator: createSequentialIdGenerator("event"),
      repository: createInMemoryEventRepository(),
    });
    const hooks = createInMemoryHookRepository([
      {
        id: "hook_retrying_failure",
        userId: "user_1",
        name: "Retrying failure",
        eventType: "client.created",
        type: "built_in",
        enabled: true,
        config: {
          retryPolicy: {
            maxAttempts: 2,
            backoff: {
              type: "fixed",
              delayMs: 60_000,
            },
          },
        },
      },
    ]);
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const service = createHookAwareEventService({
      eventService: baseEvents,
      hookRepository: hooks,
      executionRepository: executions,
      queue,
      idGenerator: createSequentialIdGenerator("execution"),
    });
    const processor = createHookExecutionProcessor({
      eventService: service,
      hookRepository: hooks,
      executionRepository: executions,
      executor: {
        async execute() {
          throw new Error("Hook keeps failing.");
        },
      },
      clock: createStepClock("2026-05-30T12:03:00.000Z"),
    });

    const event = await service.emitApp({ type: "client.created", userId: "user_1" });
    const job = queue.jobs[0];
    assert.ok(job);

    await assert.rejects(processor(job, 1), /Hook keeps failing/u);
    const afterFirstAttempt = await executions.getById(job.executionId);
    assert.equal(afterFirstAttempt?.nextRetryAt?.toISOString(), "2026-05-30T12:04:01.000Z");

    await assert.rejects(processor(job, 2), /Hook keeps failing/u);

    assert.deepEqual(
      (await executions.listForEvent(event.id)).map((record) => ({ hookId: record.hookId, status: record.status, nextRetryAt: record.nextRetryAt })),
      [{ hookId: "hook_retrying_failure", status: "failed", nextRetryAt: undefined }],
    );
  });

  it("records provenance and suppresses downstream hook automation by default for hook-driven writes", async () => {
    const baseEvents = createEventService({
      clock: createStepClock("2026-05-30T12:00:00.000Z"),
      idGenerator: createSequentialIdGenerator("event"),
      repository: createInMemoryEventRepository(),
    });
    const hooks = createInMemoryHookRepository([
      { id: "hook_writer", userId: "user_1", name: "Writer", eventType: "client.created", type: "built_in", enabled: true, config: {} },
      { id: "hook_downstream", userId: "user_1", name: "Downstream", eventType: "client.updated", type: "built_in", enabled: true, config: {} },
    ]);
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const service = createHookAwareEventService({
      eventService: baseEvents,
      hookRepository: hooks,
      executionRepository: executions,
      queue,
      idGenerator: createSequentialIdGenerator("execution"),
    });
    const processor = createHookExecutionProcessor({
      eventService: service,
      hookRepository: hooks,
      executionRepository: executions,
      executor: {
        async execute(context) {
          await emitHookWriteEvent({
            eventService: service,
            context,
            event: {
              type: "client.updated",
              userId: context.event.userId,
              entity: { type: "client", id: "client_1" },
              payload: { field: "name" },
            },
          });
          return { wrote: true };
        },
      },
    });

    await service.emitApp({ type: "client.created", userId: "user_1", entity: { type: "client", id: "client_1" } });
    const writerJob = queue.jobs[0];
    assert.ok(writerJob);

    await processor(writerJob, 1);

    const events = await service.listForUser("user_1");
    assert.equal(events.length, 2);
    const hookWriteEvent = events[1];
    assert.ok(hookWriteEvent);
    assert.equal(hookWriteEvent.source, "hook");
    assert.deepEqual(hookWriteEvent.metadata.provenance, {
      source: "hook",
      hookId: "hook_writer",
      hookExecutionId: "execution_1",
      triggeringEventId: "event_1",
    });
    assert.deepEqual(
      queue.jobs.map((job) => job.executionId),
      ["execution_1"],
    );
  });
});

function createSequentialIdGenerator(prefix: string) {
  let nextId = 0;
  return () => {
    nextId += 1;
    return `${prefix}_${nextId}`;
  };
}

function createStepClock(start: string) {
  let nextTick = new Date(start).getTime();
  return () => {
    const value = new Date(nextTick);
    nextTick += 1_000;
    return value;
  };
}
