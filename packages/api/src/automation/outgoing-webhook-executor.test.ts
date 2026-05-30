import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import { createHookExecutionProcessor, createInMemoryHookExecutionRepository, createInMemoryHookRepository } from "@DCRM/events/hooks";

import { createOutgoingWebhookExecutor } from "./outgoing-webhook-executor.js";
import { parseSafeOutgoingWebhookUrl } from "./outgoing-webhook-url.js";

import type { SecretCrypto, EncryptedSecretV1 } from "@DCRM/crypto";
import type { JsonObject } from "@DCRM/events";
import type { HookSubscription } from "@DCRM/events/hooks";

describe("outgoing webhook executor", () => {
  it("sends bearer, basic, HMAC, and custom header authentication without exposing plaintext secrets in hook config", async () => {
    const secretCrypto = createPassthroughSecretCrypto();
    const requests: CapturedRequest[] = [];
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1", clock: () => new Date("2026-01-01T00:00:00.000Z") });
    const event = await eventService.emitApp({ type: "client.created", userId: "user_1", payload: { name: "Ada" } });
    const hooks = [
      createHook("hook_bearer", { auth: { type: "bearer", token: secretCrypto.encrypt("bearer-secret") } }),
      createHook("hook_basic", { auth: { type: "basic", username: "alice", password: secretCrypto.encrypt("password-secret") } }),
      createHook("hook_hmac", { auth: { type: "hmac", secret: secretCrypto.encrypt("hmac-secret"), headerName: "X-DCRM-Signature" } }),
      createHook("hook_custom", { auth: { type: "custom_headers", headers: [{ name: "X-Api-Key", value: secretCrypto.encrypt("custom-secret") }] } }),
    ];
    const hookRepository = createInMemoryHookRepository(hooks);
    const executionRepository = createInMemoryHookExecutionRepository();
    await Promise.all(hooks.map((hook) => executionRepository.createPending({ id: `execution_${hook.id}`, event, hook, retryPolicy: { maxAttempts: 1, backoff: { type: "fixed", delayMs: 0 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") })));
    const processor = createHookExecutionProcessor({
      eventService,
      hookRepository,
      executionRepository,
      executor: createOutgoingWebhookExecutor({ secretCrypto, fetch: createRecordingFetch(requests, [200, 200, 200, 200]) }),
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
    });

    await Promise.all(hooks.map((hook) => processor({ executionId: `execution_${hook.id}` }, 1)));

    assert.equal(requests[0]?.headers.authorization, "Bearer bearer-secret");
    assert.equal(requests[1]?.headers.authorization, `Basic ${Buffer.from("alice:password-secret", "utf8").toString("base64")}`);
    assert.equal(requests[3]?.headers["x-api-key"], "custom-secret");
    const hmacRequest = requests[2];
    assert.ok(hmacRequest);
    assert.equal(hmacRequest.headers["x-dcrm-signature"], createHmac("sha256", "hmac-secret").update(hmacRequest.body).digest("hex"));
    assert.equal(JSON.stringify(hooks).includes("bearer-secret"), false);
    assert.equal(JSON.stringify(hooks).includes("password-secret"), false);
    assert.equal(JSON.stringify(hooks).includes("hmac-secret"), false);
    assert.equal(JSON.stringify(hooks).includes("custom-secret"), false);
  });

  it("retries transient webhook failures and does not block sibling hook execution", async () => {
    const secretCrypto = createPassthroughSecretCrypto();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_2", clock: () => new Date("2026-01-01T00:00:00.000Z") });
    const event = await eventService.emitApp({ type: "client.created", userId: "user_1", payload: { name: "Grace" } });
    const failingHook = createHook("hook_retry", { retryPolicy: { maxAttempts: 2, backoff: { type: "fixed", delayMs: 10 } } });
    const siblingHook = createHook("hook_sibling");
    const hookRepository = createInMemoryHookRepository([failingHook, siblingHook]);
    const executionRepository = createInMemoryHookExecutionRepository();
    await executionRepository.createPending({ id: "execution_retry", event, hook: failingHook, retryPolicy: { maxAttempts: 2, backoff: { type: "fixed", delayMs: 10 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    await executionRepository.createPending({ id: "execution_sibling", event, hook: siblingHook, retryPolicy: { maxAttempts: 1, backoff: { type: "fixed", delayMs: 0 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    const processor = createHookExecutionProcessor({
      eventService,
      hookRepository,
      executionRepository,
      executor: createOutgoingWebhookExecutor({ secretCrypto, fetch: createRecordingFetch([], [503, 200, 200]) }),
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
    });

    await assert.rejects(() => processor({ executionId: "execution_retry" }, 1), /transient/);
    await processor({ executionId: "execution_sibling" }, 1);
    await processor({ executionId: "execution_retry" }, 2);

    const retryExecution = await executionRepository.getById("execution_retry");
    const siblingExecution = await executionRepository.getById("execution_sibling");
    assert.equal(retryExecution?.status, "success");
    assert.equal(retryExecution?.attempt, 2);
    assert.deepEqual(retryExecution?.output?.delivery, { status: "delivered", statusCode: 200, attempt: 2 });
    assert.equal(siblingExecution?.status, "success");
  });

  it("marks permanent webhook failures without scheduling retries while transient failures remain retryable", async () => {
    const secretCrypto = createOpaqueSecretCrypto();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_3", clock: () => new Date("2026-01-01T00:00:00.000Z") });
    const event = await eventService.emitApp({ type: "client.created", userId: "user_1", payload: { name: "Katherine" } });
    const permanentHook = createHook("hook_permanent", { retryPolicy: { maxAttempts: 3, backoff: { type: "fixed", delayMs: 1_000 } } });
    const transientHook = createHook("hook_transient", { retryPolicy: { maxAttempts: 3, backoff: { type: "fixed", delayMs: 1_000 } } });
    const hookRepository = createInMemoryHookRepository([permanentHook, transientHook]);
    const executionRepository = createInMemoryHookExecutionRepository();
    await executionRepository.createPending({ id: "execution_permanent", event, hook: permanentHook, retryPolicy: { maxAttempts: 3, backoff: { type: "fixed", delayMs: 1_000 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    await executionRepository.createPending({ id: "execution_transient", event, hook: transientHook, retryPolicy: { maxAttempts: 3, backoff: { type: "fixed", delayMs: 1_000 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    const processor = createHookExecutionProcessor({
      eventService,
      hookRepository,
      executionRepository,
      executor: createOutgoingWebhookExecutor({ secretCrypto, fetch: createRecordingFetch([], [400, 503]) }),
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
    });

    await assert.rejects(() => processor({ executionId: "execution_permanent" }, 1), /permanent/);
    await assert.rejects(() => processor({ executionId: "execution_transient" }, 1), /transient/);

    const permanentExecution = await executionRepository.getById("execution_permanent");
    const transientExecution = await executionRepository.getById("execution_transient");
    assert.equal(permanentExecution?.status, "failed");
    assert.equal(permanentExecution?.nextRetryAt, undefined);
    assert.equal(transientExecution?.status, "failed");
    assert.deepEqual(transientExecution?.nextRetryAt, new Date("2026-01-01T00:00:03.000Z"));
  });

  it("rejects credential-bearing webhook URLs at execution without sending a request", async () => {
    const secretCrypto = createPassthroughSecretCrypto();
    const requests: CapturedRequest[] = [];
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_4", clock: () => new Date("2026-01-01T00:00:00.000Z") });
    const event = await eventService.emitApp({ type: "client.created", userId: "user_1", payload: { name: "Mary" } });
    const hook = createHook("hook_credentials", { url: "https://user:password@example.test/hooks/dcrm" });
    const hookRepository = createInMemoryHookRepository([hook]);
    const executionRepository = createInMemoryHookExecutionRepository();
    await executionRepository.createPending({ id: "execution_credentials", event, hook, retryPolicy: { maxAttempts: 1, backoff: { type: "fixed", delayMs: 0 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    const processor = createHookExecutionProcessor({
      eventService,
      hookRepository,
      executionRepository,
      executor: createOutgoingWebhookExecutor({ secretCrypto, fetch: createRecordingFetch(requests, [200]) }),
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
    });

    await assert.rejects(() => processor({ executionId: "execution_credentials" }, 1), /embedded credentials/);

    assert.deepEqual(requests, []);
  });

  it("marks invalid stored webhook configuration as non-retryable without sending a request", async () => {
    const secretCrypto = createPassthroughSecretCrypto();
    const requests: CapturedRequest[] = [];
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_5", clock: () => new Date("2026-01-01T00:00:00.000Z") });
    const event = await eventService.emitApp({ type: "client.created", userId: "user_1", payload: { name: "Dorothy" } });
    const hook = createHook("hook_invalid_config", { headers: { Host: "example.test" }, retryPolicy: { maxAttempts: 3, backoff: { type: "fixed", delayMs: 1_000 } } });
    const hookRepository = createInMemoryHookRepository([hook]);
    const executionRepository = createInMemoryHookExecutionRepository();
    await executionRepository.createPending({ id: "execution_invalid_config", event, hook, retryPolicy: { maxAttempts: 3, backoff: { type: "fixed", delayMs: 1_000 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    const processor = createHookExecutionProcessor({
      eventService,
      hookRepository,
      executionRepository,
      executor: createOutgoingWebhookExecutor({ secretCrypto, fetch: createRecordingFetch(requests, [200]) }),
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
    });

    await assert.rejects(() => processor({ executionId: "execution_invalid_config" }, 1), /not allowed/);

    const execution = await executionRepository.getById("execution_invalid_config");
    assert.equal(execution?.nextRetryAt, undefined);
    assert.deepEqual(requests, []);
  });

  it("rejects IPv6 loopback webhook URLs", () => {
    assert.throws(() => parseSafeOutgoingWebhookUrl("https://[::1]/hooks/dcrm"), /host is not allowed/);
  });
});

type CapturedRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
};

function createHook(id: string, configOverrides: JsonObject = {}): HookSubscription {
  return {
    id,
    userId: "user_1",
    name: id,
    eventType: "client.created",
    type: "outgoing_webhook",
    enabled: true,
    config: {
      url: `https://example.test/${id}`,
      auth: { type: "none" },
      ...configOverrides,
    },
  };
}

function createRecordingFetch(requests: CapturedRequest[], statuses: readonly number[]) {
  let requestCount = 0;
  return async (url: string, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);
    const normalizedHeaders: Record<string, string> = {};
    headers.forEach((value, name) => {
      normalizedHeaders[name] = value;
    });
    requests.push({ url, method: init.method ?? "GET", headers: normalizedHeaders, body: typeof init.body === "string" ? init.body : "" });
    const status = statuses[requestCount] ?? 200;
    requestCount += 1;
    return new Response(null, { status });
  };
}

function createPassthroughSecretCrypto(): SecretCrypto {
  return createOpaqueSecretCrypto();
}

function createOpaqueSecretCrypto(): SecretCrypto {
  return {
    encrypt(plaintext: string) {
      return { version: "dcrm.secret.v1", algorithm: "aes-256-gcm", encoding: "base64", ciphertext: Buffer.from(plaintext, "utf8").toString("base64"), iv: "", authTag: "" } satisfies EncryptedSecretV1;
    },
    decrypt(encrypted: EncryptedSecretV1) {
      return Buffer.from(encrypted.ciphertext, "base64").toString("utf8");
    },
  };
}
