import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryAutomationRepository } from "./repository.js";
import { createIncomingWebhookService } from "./incoming-webhook.js";

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

    await assert.rejects(() => service.receive({ slug: "protected", token: "wrong-token", payload: {} }), /Invalid incoming webhook token/);
    assert.deepEqual(await eventService.listForUser("user_1"), []);
  });
});
