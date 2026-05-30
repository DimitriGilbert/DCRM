import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import { createHookAwareEventService, createHookExecutionProcessor, createInMemoryHookExecutionRepository, createRecordingHookExecutionQueue } from "@DCRM/events/hooks";

import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";

import { createStructuredAiHookExecutor } from "../../automation/ai-hook-executor.js";
import { createRepositoryAiHookModelRunner } from "../../automation/model-runner.js";
import { createInMemoryAutomationRepository } from "../../automation/repository.js";
import { createHookAwareAiEventService } from "../../automation/runtime.js";
import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { AutomationRepository } from "../../automation/repository.js";
import type { Context } from "../../context.js";

describe("automation tRPC API", () => {
  it("surfaces current-user failed hook executions without creating notifications", async () => {
    const createdAt = new Date("2026-05-30T03:00:00.000Z");
    const automationRepository = createInMemoryAutomationRepository([
      {
        id: "execution_1",
        userId: "user_1",
        hookId: "hook_1",
        hookName: "Summarize intake",
        eventId: "event_1",
        eventType: "client.created",
        status: "failed",
        error: { message: "Provider timeout" },
        attempt: 2,
        maxAttempts: 3,
        queuedAt: createdAt,
        startedAt: createdAt,
        finishedAt: createdAt,
        nextRetryAt: null,
        createdAt,
      },
      {
        id: "execution_2",
        userId: "user_2",
        hookId: "hook_2",
        hookName: "Other user hook",
        eventId: "event_2",
        eventType: "lead.created",
        status: "failed",
        error: { message: "Should not leak" },
        attempt: 1,
        maxAttempts: 1,
        queuedAt: createdAt,
        startedAt: createdAt,
        finishedAt: createdAt,
        nextRetryAt: null,
        createdAt,
      },
    ]);
    const caller = appRouter.createCaller(createTestContext("user_1", automationRepository));

    const failures = await caller.automation.listFailedHookExecutions({ limit: 10 });
    const notifications = await caller.notifications.list({ limit: 10 });

    assert.deepEqual(failures.map((failure) => failure.id), ["execution_1"]);
    assert.deepEqual(notifications, []);
  });

  it("executes matching stored AI hooks from event context and stores validated insights", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const crmRepository = createInMemoryCrmRepository();
    const baseEvents = createEventService({ repository: createInMemoryEventRepository(), idGenerator: createSequentialIdGenerator("event") });
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const service = createHookAwareEventService({
      eventService: baseEvents,
      hookRepository: automationRepository.hooks,
      executionRepository: executions,
      queue,
      idGenerator: createSequentialIdGenerator("execution"),
    });
    await automationRepository.hooks.createAiHook({
      id: "hook_ai",
      userId: "user_1",
      name: "Summarize client",
      eventType: "client.created",
      enabled: true,
      providerId: "provider_1",
      model: "model_1",
      template: "summarize",
      outputFields: [{ name: "summary", type: "string", required: true }],
      fieldMappings: [{ sourcePath: "summary", targetField: "notes" }],
      writeBehavior: "propose",
      downstreamEventBehavior: "suppress",
      now: new Date("2026-05-30T12:00:00.000Z"),
    });
    const processor = createHookExecutionProcessor({
      eventService: service,
      hookRepository: automationRepository.hooks,
      executionRepository: executions,
      executor: createStructuredAiHookExecutor({
        automationRepository,
        crmRepository,
        eventService: service,
        runner: { async generateStructured() { return { summary: "Client needs monthly reporting." }; } },
        idGenerator: () => "insight_1",
      }),
    });

    await service.emitApp({ type: "client.created", userId: "user_1", entity: { type: "client", id: "client_1" } });
    const job = queue.jobs[0];
    assert.ok(job);
    await processor(job, 1);

    const insights = await automationRepository.aiInsights.listForUser({ userId: "user_1" });
    assert.equal(insights.length, 1);
    assert.equal(insights[0]?.id, "insight_1");
    assert.equal(insights[0]?.hookExecutionId, "execution_1");
    assert.equal(insights[0]?.entityType, "client");
    assert.equal(insights[0]?.entityId, "client_1");
    assert.deepEqual(insights[0]?.structuredOutput, { summary: "Client needs monthly reporting." });
    assert.equal((await crmRepository.clients.getById({ userId: "user_1", id: "client_1" }))?.notes, undefined);
  });

  it("uses the production hook-aware API event service and BYOK model runner for stored AI hooks", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const crmRepository = createInMemoryCrmRepository();
    const baseEvents = createEventService({ repository: createInMemoryEventRepository(), idGenerator: createSequentialIdGenerator("event") });
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const secretCrypto = createPassthroughSecretCrypto();
    const savedProvider = await automationRepository.aiProviders.upsertEncrypted({
      userId: "user_1",
      name: "OpenRouter",
      type: "openrouter",
      encryptedApiKey: secretCrypto.encrypt("openrouter-secret"),
      baseUrl: null,
      defaultModel: "openai/gpt-5.1",
      enabled: true,
      now: new Date("2026-05-30T12:00:00.000Z"),
    });
    await automationRepository.hooks.createAiHook({
      id: "hook_ai",
      userId: "user_1",
      name: "Summarize API-created client",
      eventType: "client.created",
      enabled: true,
      providerId: savedProvider.id,
      model: savedProvider.defaultModel ?? "openai/gpt-5.1",
      template: "summarize",
      outputFields: [{ name: "summary", type: "string", required: true }],
      fieldMappings: [],
      writeBehavior: "propose",
      downstreamEventBehavior: "suppress",
      now: new Date("2026-05-30T12:00:00.000Z"),
    });
    const service = createHookAwareAiEventService({
      eventService: baseEvents,
      automationRepository,
      executionRepository: executions,
      queue,
      idGenerator: createSequentialIdGenerator("execution"),
    });
    const runner = createRepositoryAiHookModelRunner({
      automationRepository,
      secretCrypto,
      async generateStructured({ provider, request }) {
        assert.equal(provider.apiKey, "openrouter-secret");
        assert.equal(provider.type, "openrouter");
        assert.equal(request.userId, "user_1");
        assert.equal(request.providerId, savedProvider.id);
        return { summary: "Created through API event context." };
      },
    });
    const processor = createHookExecutionProcessor({
      eventService: service,
      hookRepository: automationRepository.hooks,
      executionRepository: executions,
      executor: createStructuredAiHookExecutor({
        automationRepository,
        crmRepository,
        eventService: service,
        runner,
        idGenerator: () => "insight_1",
      }),
    });

    await service.emitApi({ type: "client.created", userId: "user_1", entity: { type: "client", id: "client_1" } });
    const job = queue.jobs[0];
    assert.ok(job);
    await processor(job, 1);

    const insights = await automationRepository.aiInsights.listForUser({ userId: "user_1" });
    assert.deepEqual(insights.map((insight) => insight.structuredOutput), [{ summary: "Created through API event context." }]);
  });

  it("direct-write AI hooks use hook write context with downstream suppression by default", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const crmRepository = createInMemoryCrmRepository();
    await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme" }, now: new Date("2026-05-30T12:00:00.000Z") });
    const baseEvents = createEventService({ repository: createInMemoryEventRepository(), idGenerator: createSequentialIdGenerator("event") });
    const executions = createInMemoryHookExecutionRepository();
    const queue = createRecordingHookExecutionQueue();
    const service = createHookAwareEventService({
      eventService: baseEvents,
      hookRepository: automationRepository.hooks,
      executionRepository: executions,
      queue,
      idGenerator: createSequentialIdGenerator("execution"),
    });
    await automationRepository.hooks.createAiHook({
      id: "hook_ai",
      userId: "user_1",
      name: "Write notes",
      eventType: "client.created",
      enabled: true,
      providerId: "provider_1",
      model: "model_1",
      template: "summarize",
      outputFields: [{ name: "summary", type: "string", required: true }],
      fieldMappings: [{ sourcePath: "summary", targetField: "notes" }],
      writeBehavior: "direct",
      downstreamEventBehavior: "suppress",
      now: new Date("2026-05-30T12:00:00.000Z"),
    });
    const processor = createHookExecutionProcessor({
      eventService: service,
      hookRepository: automationRepository.hooks,
      executionRepository: executions,
      executor: createStructuredAiHookExecutor({
        automationRepository,
        crmRepository,
        eventService: service,
        runner: { async generateStructured() { return { summary: "AI-written note." }; } },
        idGenerator: () => "insight_1",
      }),
    });

    await service.emitApp({ type: "client.created", userId: "user_1", entity: { type: "client", id: "client_1" } });
    const job = queue.jobs[0];
    assert.ok(job);
    await processor(job, 1);

    assert.equal((await crmRepository.clients.getById({ userId: "user_1", id: "client_1" }))?.notes, "AI-written note.");
    const events = await service.listForUser("user_1");
    const hookWriteEvent = events[1];
    assert.ok(hookWriteEvent);
    assert.deepEqual(hookWriteEvent.metadata.provenance, {
      source: "hook",
      hookId: "hook_ai",
      hookExecutionId: "execution_1",
      triggeringEventId: "event_1",
    });
    assert.equal(hookWriteEvent.metadata.downstreamEventPolicy, "suppress_hooks");
    assert.deepEqual(queue.jobs.map((queuedJob) => queuedJob.executionId), ["execution_1"]);
  });
});

function createTestContext(userId: string, automationRepository: AutomationRepository): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    automationRepository,
    crmRepository: createInMemoryCrmRepository(),
    eventService: createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" }),
    session: null,
  };
}

function createSequentialIdGenerator(prefix: string) {
  let nextId = 0;
  return () => {
    nextId += 1;
    return `${prefix}_${nextId}`;
  };
}

function createPassthroughSecretCrypto(): SecretCrypto {
  return {
    encrypt(plaintext: string) {
      return { version: "dcrm.secret.v1", algorithm: "aes-256-gcm", encoding: "base64", ciphertext: plaintext, iv: "", authTag: "" } satisfies EncryptedSecretV1;
    },
    decrypt(encrypted: EncryptedSecretV1) {
      return encrypted.ciphertext;
    },
  };
}
