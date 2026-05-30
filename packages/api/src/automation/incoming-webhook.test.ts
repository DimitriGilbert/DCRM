import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryAutomationRepository } from "./repository.js";
import { IncomingWebhookAuthenticationError, IncomingWebhookNotFoundError, IncomingWebhookPayloadMappingError, createIncomingWebhookService, mapIncomingWebhookPayload } from "./incoming-webhook.js";
import { handleIncomingWebhookPost } from "./incoming-webhook-route-handler.js";
import type { IncomingWebhookReceiveInput, IncomingWebhookReceiveResult } from "./incoming-webhook.js";
import type { IncomingWebhookReceiver } from "./incoming-webhook-route-handler.js";

describe("incoming webhook mapping", () => {
  it("previews mapped event payloads in test mode without emitting events", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const service = createIncomingWebhookService({ automationRepository, eventService, tokenHasher: (token) => `hash:${token}` });
    await automationRepository.incomingWebhooks.create({
      id: "incoming_1",
      userId: "user_1",
      name: "Intake form",
      slug: "intake-form",
      enabled: true,
      tokenHash: "hash:secret-token",
      mode: "test",
      targetEventType: "webhook.webhook_received",
      mappingConfig: { mappings: [{ sourcePath: "$.contact.email", targetPath: "contact.email" }, { sourcePath: "$.amount", targetPath: "deal.value" }] },
      now: new Date("2026-05-30T12:00:00.000Z"),
    });

    const result = await service.receive({ slug: "intake-form", token: "secret-token", payload: { contact: { email: "client@example.test" }, amount: 1200 } });

    assert.equal(result.mode, "test");
    assert.equal(result.emittedEvent, null);
    assert.deepEqual(result.preview, { contact: { email: "client@example.test" }, deal: { value: 1200 } });
    assert.deepEqual(await eventService.listForUser("user_1"), []);
  });

  it("emits normalized internal events in live mode and never mutates CRM records directly", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const service = createIncomingWebhookService({ automationRepository, eventService, tokenHasher: (token) => `hash:${token}` });
    await automationRepository.incomingWebhooks.create({
      id: "incoming_1",
      userId: "user_1",
      name: "Lead source",
      slug: "lead-source",
      enabled: true,
      tokenHash: "hash:secret-token",
      mode: "live",
      targetEventType: "webhook.webhook_received",
      mappingConfig: { mappings: [{ sourcePath: "$.lead.email", targetPath: "lead.email" }] },
      now: new Date("2026-05-30T12:00:00.000Z"),
    });

    const result = await service.receive({ slug: "lead-source", token: "secret-token", payload: { lead: { email: "prospect@example.test" } } });

    assert.equal(result.mode, "live");
    assert.deepEqual(result.preview, { lead: { email: "prospect@example.test" } });
    assert.equal(result.emittedEvent?.id, "event_1");
    assert.equal(result.emittedEvent?.type, "webhook.webhook_received");
    assert.equal(result.emittedEvent?.source, "webhook");
    assert.deepEqual(result.emittedEvent?.entity, { type: "webhook", id: "incoming_1" });
    assert.deepEqual(result.emittedEvent?.payload, { lead: { email: "prospect@example.test" }, webhook: { id: "incoming_1", slug: "lead-source" } });
  });

  it("rejects requests with invalid incoming webhook tokens", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository() });
    const service = createIncomingWebhookService({ automationRepository, eventService, tokenHasher: (token) => `hash:${token}` });
    await automationRepository.incomingWebhooks.create({
      id: "incoming_1",
      userId: "user_1",
      name: "Protected",
      slug: "protected",
      enabled: true,
      tokenHash: "hash:secret-token",
      mode: "live",
      targetEventType: "webhook.webhook_received",
      mappingConfig: { mappings: [] },
      now: new Date("2026-05-30T12:00:00.000Z"),
    });

    await assert.rejects(() => service.receive({ slug: "protected", token: "wrong-token", payload: {} }), /Invalid incoming webhook credentials/);
    assert.deepEqual(await eventService.listForUser("user_1"), []);
  });

  it("rejects prototype-polluting target paths during mapping", () => {
    assert.throws(() => mapIncomingWebhookPayload({ mappings: [{ sourcePath: "$.email", targetPath: "__proto__.polluted" }] }, { email: "client@example.test" }), /not allowed/);
    assert.throws(() => mapIncomingWebhookPayload({ mappings: [{ sourcePath: "$.email", targetPath: "contact.constructor.polluted" }] }, { email: "client@example.test" }), /not allowed/);
    assert.throws(() => mapIncomingWebhookPayload({ mappings: [{ sourcePath: "$.email", targetPath: "contact.prototype.polluted" }] }, { email: "client@example.test" }), /not allowed/);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
  });

  it("wraps runtime mapping failures without leaking internal parser errors", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository() });
    const service = createIncomingWebhookService({ automationRepository, eventService, tokenHasher: (token) => `hash:${token}` });
    await automationRepository.incomingWebhooks.create({
      id: "incoming_1",
      userId: "user_1",
      name: "Protected",
      slug: "protected",
      enabled: true,
      tokenHash: "hash:secret-token",
      mode: "live",
      targetEventType: "webhook.webhook_received",
      mappingConfig: { mappings: [{ sourcePath: "$.email", targetPath: "__proto__.polluted" }] },
      now: new Date("2026-05-30T12:00:00.000Z"),
    });

    await assert.rejects(() => service.receive({ slug: "protected", token: "secret-token", payload: { email: "client@example.test" } }), IncomingWebhookPayloadMappingError);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
  });
});

describe("incoming webhook route handler", () => {
  it("returns a generic 400 for malformed JSON without calling the receiver", async () => {
    let receiveCalls = 0;
    const body = "{";
    const response = await handleIncomingWebhookPost({
      request: new Request("https://dcrm.example.test/api/incoming-webhooks/intake", { method: "POST", headers: { "content-length": String(body.length) }, body }),
      slug: "intake",
      service: createReceiver(async () => {
        receiveCalls += 1;
        return createLiveResult();
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Incoming webhook payload must be a valid JSON object." });
    assert.equal(receiveCalls, 0);
  });

  it("rejects missing Content-Length before parsing the request body", async () => {
    let receiveCalls = 0;
    const response = await handleIncomingWebhookPost({
      request: new Request("https://dcrm.example.test/api/incoming-webhooks/intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "client@example.test" }) }),
      slug: "intake",
      service: createReceiver(async () => {
        receiveCalls += 1;
        return createLiveResult();
      }),
    });

    assert.equal(response.status, 411);
    assert.deepEqual(await response.json(), { error: "Incoming webhook requests must include a valid Content-Length header." });
    assert.equal(receiveCalls, 0);
  });

  it("rejects invalid Content-Length before parsing the request body", async () => {
    let receiveCalls = 0;
    const response = await handleIncomingWebhookPost({
      request: new Request("https://dcrm.example.test/api/incoming-webhooks/intake", { method: "POST", headers: { "content-length": "not-a-number", "content-type": "application/json" }, body: JSON.stringify({ email: "client@example.test" }) }),
      slug: "intake",
      service: createReceiver(async () => {
        receiveCalls += 1;
        return createLiveResult();
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Incoming webhook Content-Length header is invalid." });
    assert.equal(receiveCalls, 0);
  });

  it("rejects oversized Content-Length before parsing the request body", async () => {
    let receiveCalls = 0;
    const response = await handleIncomingWebhookPost({
      request: new Request("https://dcrm.example.test/api/incoming-webhooks/intake", { method: "POST", headers: { "content-length": "1048577", "content-type": "application/json" }, body: JSON.stringify({ email: "client@example.test" }) }),
      slug: "intake",
      service: createReceiver(async () => {
        receiveCalls += 1;
        return createLiveResult();
      }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "Incoming webhook payload exceeds the maximum allowed size." });
    assert.equal(receiveCalls, 0);
  });

  it("ignores query-string tokens and maps authentication failures to a generic 401", async () => {
    let receivedInput: IncomingWebhookReceiveInput | undefined;
    const response = await handleIncomingWebhookPost({
      request: jsonRequest("https://dcrm.example.test/api/incoming-webhooks/intake?token=secret-token", { email: "client@example.test" }),
      slug: "intake",
      service: createReceiver(async (input) => {
        receivedInput = input;
        throw new IncomingWebhookAuthenticationError();
      }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Incoming webhook credentials are invalid." });
    assert.equal(receivedInput?.token, null);
  });

  it("maps missing or disabled webhooks to a generic 404", async () => {
    const response = await handleIncomingWebhookPost({
      request: jsonRequest("https://dcrm.example.test/api/incoming-webhooks/disabled", { email: "client@example.test" }),
      slug: "disabled",
      service: createReceiver(async () => {
        throw new IncomingWebhookNotFoundError();
      }),
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Incoming webhook was not found." });
  });

  it("maps payload mapping failures to a generic 400 without leaking internals", async () => {
    const response = await handleIncomingWebhookPost({
      request: jsonRequest("https://dcrm.example.test/api/incoming-webhooks/intake", { email: "client@example.test" }),
      slug: "intake",
      service: createReceiver(async () => {
        throw new IncomingWebhookPayloadMappingError(new Error("__proto__.polluted parser detail"));
      }),
    });

    const body = await response.text();
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(body) as Record<string, unknown>, { error: "Incoming webhook payload could not be processed." });
    assert.equal(body.includes("__proto__"), false);
  });

  it("maps event emission failures to a generic 502 without leaking raw errors", async () => {
    const response = await handleIncomingWebhookPost({
      request: jsonRequest("https://dcrm.example.test/api/incoming-webhooks/intake", { email: "client@example.test" }),
      slug: "intake",
      service: createReceiver(async () => {
        throw new Error("database password leaked internal detail");
      }),
    });

    const body = await response.text();
    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(body) as Record<string, unknown>, { error: "Incoming webhook delivery failed." });
    assert.equal(body.includes("database password"), false);
  });
});

function createReceiver(receive: (input: IncomingWebhookReceiveInput) => Promise<IncomingWebhookReceiveResult>): IncomingWebhookReceiver {
  return { receive };
}

function createLiveResult(): IncomingWebhookReceiveResult {
  return { mode: "live", preview: {}, emittedEvent: null };
}

function jsonRequest(url: string, body: Record<string, unknown>): Request {
  const serializedBody = JSON.stringify(body);
  return new Request(url, { method: "POST", headers: { "content-length": String(serializedBody.length), "content-type": "application/json" }, body: serializedBody });
}
