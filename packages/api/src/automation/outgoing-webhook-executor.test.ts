import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import { createHookExecutionProcessor, createInMemoryHookExecutionRepository, createInMemoryHookRepository } from "@DCRM/events/hooks";
import type { SecretCrypto, EncryptedSecretV1 } from "@DCRM/crypto";
import type { JsonObject } from "@DCRM/events";
import type { HookSubscription } from "@DCRM/events/hooks";

import { createOutgoingWebhookExecutor } from "./outgoing-webhook-executor.js";
import type { OutgoingWebhookRequestFactory, OutgoingWebhookRequestHandle, OutgoingWebhookRequestOptions, OutgoingWebhookResponseMessage } from "./outgoing-webhook-executor.js";
import { parseSafeOutgoingWebhookUrl, resolveOutgoingWebhookConnectionTarget, validateOutgoingWebhookDestination } from "./outgoing-webhook-url.js";

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
      executor: createOutgoingWebhookExecutor({ secretCrypto, requestFactory: createRecordingRequestFactory(requests, [200, 200, 200, 200]), addressResolver: createStaticAddressResolver("203.0.113.10") }),
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
      executor: createOutgoingWebhookExecutor({ secretCrypto, requestFactory: createRecordingRequestFactory([], [503, 200, 200]), addressResolver: createStaticAddressResolver("203.0.113.10") }),
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
      executor: createOutgoingWebhookExecutor({ secretCrypto, requestFactory: createRecordingRequestFactory([], [400, 503]), addressResolver: createStaticAddressResolver("203.0.113.10") }),
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
      executor: createOutgoingWebhookExecutor({ secretCrypto, requestFactory: createRecordingRequestFactory(requests, [200]), addressResolver: createStaticAddressResolver("203.0.113.10") }),
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
      executor: createOutgoingWebhookExecutor({ secretCrypto, requestFactory: createRecordingRequestFactory(requests, [200]), addressResolver: createStaticAddressResolver("203.0.113.10") }),
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

  it("rejects unsafe literal and resolved webhook destinations", async () => {
    assert.throws(() => parseSafeOutgoingWebhookUrl("https://127.0.0.1/hooks/dcrm"), /host is not allowed/);
    assert.throws(() => parseSafeOutgoingWebhookUrl("https://[::ffff:10.0.0.1]/hooks/dcrm"), /host is not allowed/);
    assert.throws(() => parseSafeOutgoingWebhookUrl("https://[fe80::1]/hooks/dcrm"), /host is not allowed/);
    await assert.rejects(
      () => validateOutgoingWebhookDestination(new URL("https://safe.example.test/hooks/dcrm"), createStaticAddressResolver("192.168.1.25")),
      /resolves to a host that is not allowed/,
    );
    await assert.rejects(
      () => validateOutgoingWebhookDestination(new URL("https://safe.example.test/hooks/dcrm"), createStaticAddressResolver("::ffff:172.16.0.1")),
      /resolves to a host that is not allowed/,
    );
  });

  it("selects a vetted resolved address for the actual outgoing webhook connection", async () => {
    await assert.rejects(
      () => resolveOutgoingWebhookConnectionTarget(new URL("https://safe.example.test/hooks/dcrm"), createStaticAddressResolver("169.254.169.254")),
      /resolves to a host that is not allowed/,
    );

    assert.deepEqual(await resolveOutgoingWebhookConnectionTarget(new URL("https://safe.example.test/hooks/dcrm"), createStaticAddressResolver("203.0.113.10")), {
      address: "203.0.113.10",
      family: 4,
    });
  });

  it("executes deliveries against the vetted address while preserving the original host and never following redirects", async () => {
    const secretCrypto = createPassthroughSecretCrypto();
    const requests: CapturedRequest[] = [];
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_connection_bound", clock: () => new Date("2026-01-01T00:00:00.000Z") });
    const event = await eventService.emitApp({ type: "client.created", userId: "user_1", payload: { name: "Mildred" } });
    const hook = createHook("hook_connection_bound", { url: "https://safe.example.test/hooks/dcrm" });
    const hookRepository = createInMemoryHookRepository([hook]);
    const executionRepository = createInMemoryHookExecutionRepository();
    await executionRepository.createPending({ id: "execution_connection_bound", event, hook, retryPolicy: { maxAttempts: 1, backoff: { type: "fixed", delayMs: 0 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    const processor = createHookExecutionProcessor({
      eventService,
      hookRepository,
      executionRepository,
      executor: createOutgoingWebhookExecutor({ secretCrypto, requestFactory: createRecordingRequestFactory(requests, [302]), addressResolver: createStaticAddressResolver("203.0.113.10") }),
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
    });

    await assert.rejects(() => processor({ executionId: "execution_connection_bound" }, 1), /permanent/);

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://safe.example.test/hooks/dcrm");
    assert.equal(requests[0]?.hostname, "203.0.113.10");
    assert.notEqual(requests[0]?.hostname, "safe.example.test");
    assert.equal(requests[0]?.headers.host, "safe.example.test");
    assert.equal(requests[0]?.servername, "safe.example.test");
  });

  it("sends a stable idempotency header across retry attempts for the same execution", async () => {
    const secretCrypto = createPassthroughSecretCrypto();
    const requests: CapturedRequest[] = [];
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_6", clock: () => new Date("2026-01-01T00:00:00.000Z") });
    const event = await eventService.emitApp({ type: "client.created", userId: "user_1", payload: { name: "Hedy" } });
    const hook = createHook("hook_idempotent", {
      auth: {
        type: "custom_headers",
        headers: [
          { name: "Idempotency-Key", value: secretCrypto.encrypt("auth_idempotency_override") },
          { name: "X-DCRM-Delivery-ID", value: secretCrypto.encrypt("auth_delivery_override") },
        ],
      },
      headers: { "idempotency-key": "config_idempotency_override", "x-dcrm-delivery-id": "config_delivery_override" },
      retryPolicy: { maxAttempts: 2, backoff: { type: "fixed", delayMs: 0 } },
    });
    const hookRepository = createInMemoryHookRepository([hook]);
    const executionRepository = createInMemoryHookExecutionRepository();
    await executionRepository.createPending({ id: "execution_idempotent", event, hook, retryPolicy: { maxAttempts: 2, backoff: { type: "fixed", delayMs: 0 } }, queuedAt: new Date("2026-01-01T00:00:01.000Z") });
    const processor = createHookExecutionProcessor({
      eventService,
      hookRepository,
      executionRepository,
      executor: createOutgoingWebhookExecutor({ secretCrypto, requestFactory: createRecordingRequestFactory(requests, [503, 200]), addressResolver: createStaticAddressResolver("203.0.113.10") }),
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
    });

    await assert.rejects(() => processor({ executionId: "execution_idempotent" }, 1), /transient/);
    await processor({ executionId: "execution_idempotent" }, 2);

    assert.equal(requests[0]?.headers["idempotency-key"], "execution_idempotent");
    assert.equal(requests[1]?.headers["idempotency-key"], "execution_idempotent");
    assert.equal(requests[0]?.headers["x-dcrm-delivery-id"], "execution_idempotent");
    assert.equal(requests[1]?.headers["x-dcrm-delivery-id"], "execution_idempotent");
  });
});

type CapturedRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly hostname: string;
  readonly servername: string;
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

function createRecordingRequestFactory(requests: CapturedRequest[], statuses: readonly number[]): OutgoingWebhookRequestFactory {
  let requestCount = 0;
  return (url: URL, options: OutgoingWebhookRequestOptions, callback: (response: OutgoingWebhookResponseMessage) => void): OutgoingWebhookRequestHandle => {
    const status = statuses[requestCount] ?? 200;
    requestCount += 1;
    return {
      on() {
        return this;
      },
      end(body: string) {
        requests.push({ url: url.toString(), method: options.method, headers: options.headers, body, hostname: options.hostname, servername: options.servername });
        queueMicrotask(() => callback(createResponseMessage(status)));
      },
    };
  };
}

function createResponseMessage(statusCode: number): OutgoingWebhookResponseMessage {
  return {
    statusCode,
    resume() {},
    on(_event: "end", listener: () => void) {
      queueMicrotask(listener);
      return this;
    },
  };
}

function createStaticAddressResolver(address: string) {
  return async () => [{ address }];
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
