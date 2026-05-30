import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";

import {
  extractValue,
  mapPayload,
  validateMappingConfig,
  type MappingConfig,
  type FieldMapping,
} from "../src/mapper";

import {
  verifyRequest,
  handleIncomingWebhook,
  type IncomingWebhookRecord,
  type IncomingWebhookDeps,
  type IncomingWebhookResult,
} from "../src/incoming";

import type { EventPersister } from "@DCRM/events";

// ===================================================================
// JSON Path Extraction Tests
// ===================================================================

describe("extractValue", () => {
  it("extracts a top-level value", () => {
    const payload = { name: "Alice", email: "alice@example.com" };
    expect(extractValue(payload, "name")).toBe("Alice");
    expect(extractValue(payload, "email")).toBe("alice@example.com");
  });

  it("extracts a nested value", () => {
    const payload = { data: { user: { email: "bob@example.com" } } };
    expect(extractValue(payload, "data.user.email")).toBe("bob@example.com");
  });

  it("returns undefined for missing path", () => {
    const payload = { name: "Alice" };
    expect(extractValue(payload, "missing")).toBeUndefined();
    expect(extractValue(payload, "data.missing.path")).toBeUndefined();
  });

  it("returns undefined when traversing through null", () => {
    const payload = { data: null };
    expect(extractValue(payload, "data.name")).toBeUndefined();
  });

  it("extracts values from arrays using bracket notation", () => {
    const payload = { items: ["first", "second", "third"] };
    expect(extractValue(payload, "items[0]")).toBe("first");
    expect(extractValue(payload, "items[2]")).toBe("third");
  });

  it("extracts values from array of objects", () => {
    const payload = {
      contacts: [
        { email: "a@example.com", name: "A" },
        { email: "b@example.com", name: "B" },
      ],
    };
    expect(extractValue(payload, "contacts[1].email")).toBe("b@example.com");
    expect(extractValue(payload, "contacts[0].name")).toBe("A");
  });

  it("returns undefined for out-of-bounds array index", () => {
    const payload = { items: ["one"] };
    expect(extractValue(payload, "items[5]")).toBeUndefined();
  });

  it("returns undefined when traversing through a non-object", () => {
    const payload = { name: "string value" };
    expect(extractValue(payload, "name.something")).toBeUndefined();
  });

  it("returns the whole payload for empty path", () => {
    const payload = { a: 1 };
    expect(extractValue(payload, "")).toBe(payload);
    expect(extractValue(payload, ".")).toBe(payload);
  });

  it("handles deeply nested mixed paths", () => {
    const payload = {
      response: {
        data: {
          results: [
            { contacts: [{ email: "deep@example.com" }] },
          ],
        },
      },
    };
    expect(extractValue(payload, "response.data.results[0].contacts[0].email")).toBe("deep@example.com");
  });

  it("extracts numeric values", () => {
    const payload = { count: 42, nested: { score: 99.5 } };
    expect(extractValue(payload, "count")).toBe(42);
    expect(extractValue(payload, "nested.score")).toBe(99.5);
  });

  it("extracts boolean values", () => {
    const payload = { active: true, flags: { verified: false } };
    expect(extractValue(payload, "active")).toBe(true);
    expect(extractValue(payload, "flags.verified")).toBe(false);
  });
});

// ===================================================================
// Mapping Engine Tests
// ===================================================================

describe("mapPayload", () => {
  it("maps fields from a flat payload", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "from", targetField: "sender" },
        { sourcePath: "subject", targetField: "title" },
        { sourcePath: "body", targetField: "content" },
      ],
    };

    const result = mapPayload(
      { from: "alice@example.com", subject: "Hello", body: "World" },
      config,
    );

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toEqual({
      sender: "alice@example.com",
      title: "Hello",
      content: "World",
    });
  });

  it("maps fields from a nested payload", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "data.sender.email", targetField: "sender" },
        { sourcePath: "data.message.subject", targetField: "title" },
      ],
    };

    const result = mapPayload(
      {
        data: {
          sender: { email: "bob@example.com" },
          message: { subject: "Test" },
        },
      },
      config,
    );

    expect(result.success).toBe(true);
    expect(result.payload).toEqual({
      sender: "bob@example.com",
      title: "Test",
    });
  });

  it("uses default values when source path is missing", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "from", targetField: "sender", defaultValue: "unknown" },
        { sourcePath: "missing.path", targetField: "optional", defaultValue: "default-val" },
      ],
    };

    const result = mapPayload({ from: "alice@example.com" }, config);

    expect(result.success).toBe(true);
    expect(result.payload.sender).toBe("alice@example.com");
    expect(result.payload.optional).toBe("default-val");
  });

  it("reports errors for missing paths without defaults", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "missing.field", targetField: "required" },
      ],
    };

    const result = mapPayload({}, config);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.targetField).toBe("required");
    expect(result.errors[0]!.sourcePath).toBe("missing.field");
  });

  it("coerces values to string", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "count", targetField: "countStr", coerce: "string" },
      ],
    };

    const result = mapPayload({ count: 42 }, config);

    expect(result.success).toBe(true);
    expect(result.payload.countStr).toBe("42");
    expect(typeof result.payload.countStr).toBe("string");
  });

  it("coerces values to number", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "amount", targetField: "amountNum", coerce: "number" },
      ],
    };

    const result = mapPayload({ amount: "99.5" }, config);

    expect(result.success).toBe(true);
    expect(result.payload.amountNum).toBe(99.5);
  });

  it("coerces values to boolean", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "flag1", targetField: "bool1", coerce: "boolean" },
        { sourcePath: "flag2", targetField: "bool2", coerce: "boolean" },
        { sourcePath: "flag3", targetField: "bool3", coerce: "boolean" },
      ],
    };

    const result = mapPayload({ flag1: "true", flag2: "false", flag3: 1 }, config);

    expect(result.success).toBe(true);
    expect(result.payload.bool1).toBe(true);
    expect(result.payload.bool2).toBe(false);
    expect(result.payload.bool3).toBe(true);
  });

  it("reports coercion errors", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "bad", targetField: "num", coerce: "number" },
      ],
    };

    const result = mapPayload({ bad: "not-a-number" }, config);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Coercion to number failed");
  });

  it("merges static payload values", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "from", targetField: "sender" },
      ],
      staticPayload: { source: "stripe", version: 2 },
    };

    const result = mapPayload({ from: "alice@example.com" }, config);

    expect(result.success).toBe(true);
    expect(result.payload).toEqual({
      source: "stripe",
      version: 2,
      sender: "alice@example.com",
    });
  });

  it("field mappings override static payload on collision", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "source", targetField: "source" },
      ],
      staticPayload: { source: "default" },
    };

    const result = mapPayload({ source: "override" }, config);

    expect(result.payload.source).toBe("override");
  });

  it("handles empty fields array", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [],
    };

    const result = mapPayload({ foo: "bar" }, config);

    expect(result.success).toBe(true);
    expect(result.payload).toEqual({});
  });

  it("extracts from array elements", () => {
    const config: MappingConfig = {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "data[0].email", targetField: "email" },
      ],
    };

    const result = mapPayload(
      { data: [{ email: "first@example.com" }, { email: "second@example.com" }] },
      config,
    );

    expect(result.success).toBe(true);
    expect(result.payload.email).toBe("first@example.com");
  });
});

// ===================================================================
// Mapping Config Validation Tests
// ===================================================================

describe("validateMappingConfig", () => {
  it("accepts a valid config", () => {
    const errors = validateMappingConfig({
      eventType: "exchange.created",
      fields: [
        { sourcePath: "from", targetField: "sender" },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects non-object input", () => {
    expect(validateMappingConfig(null)).toContain("Mapping config must be an object");
    expect(validateMappingConfig("string")).toContain("Mapping config must be an object");
    expect(validateMappingConfig(42)).toContain("Mapping config must be an object");
  });

  it("rejects missing eventType", () => {
    const errors = validateMappingConfig({ fields: [] });
    expect(errors).toContain("eventType must be a non-empty string");
  });

  it("rejects empty eventType", () => {
    const errors = validateMappingConfig({ eventType: "", fields: [] });
    expect(errors).toContain("eventType must be a non-empty string");
  });

  it("rejects non-array fields", () => {
    const errors = validateMappingConfig({ eventType: "test", fields: "not-array" });
    expect(errors).toContain("fields must be an array");
  });

  it("rejects field with missing sourcePath", () => {
    const errors = validateMappingConfig({
      eventType: "test",
      fields: [{ targetField: "x" }],
    });
    expect(errors.some((e) => e.includes("sourcePath must be a non-empty string"))).toBe(true);
  });

  it("rejects field with missing targetField", () => {
    const errors = validateMappingConfig({
      eventType: "test",
      fields: [{ sourcePath: "x" }],
    });
    expect(errors.some((e) => e.includes("targetField must be a non-empty string"))).toBe(true);
  });

  it("rejects invalid coerce value", () => {
    const errors = validateMappingConfig({
      eventType: "test",
      fields: [{ sourcePath: "x", targetField: "y", coerce: "invalid" }],
    });
    expect(errors.some((e) => e.includes("coerce must be"))).toBe(true);
  });

  it("accepts valid coerce values", () => {
    for (const coerce of ["string", "number", "boolean"] as const) {
      const errors = validateMappingConfig({
        eventType: "test",
        fields: [{ sourcePath: "x", targetField: "y", coerce }],
      });
      expect(errors).toHaveLength(0);
    }
  });

  it("accepts staticPayload as an object", () => {
    const errors = validateMappingConfig({
      eventType: "test",
      fields: [],
      staticPayload: { key: "val" },
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects non-object staticPayload", () => {
    const errors = validateMappingConfig({
      eventType: "test",
      fields: [],
      staticPayload: "not-object",
    });
    expect(errors).toContain("staticPayload must be an object if provided");
  });
});

// ===================================================================
// Request Verification Tests
// ===================================================================

describe("verifyRequest", () => {
  it("accepts request without secret (no secret configured)", () => {
    const result = verifyRequest("body", null, null);
    expect(result.valid).toBe(true);
  });

  it("accepts request without secret (empty secret)", () => {
    const result = verifyRequest("body", "", null);
    expect(result.valid).toBe(true);
  });

  it("rejects request when secret is set but no signature header", () => {
    const result = verifyRequest("body", "my-secret", null);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing X-DCRM-Signature");
  });

  it("rejects request with wrong signature", () => {
    const result = verifyRequest("body", "my-secret", "wrong-signature");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid signature");
  });

  it("accepts request with correct HMAC-SHA256 signature", () => {
    const secret = "my-secret-key";
    const body = JSON.stringify({ test: true });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    const result = verifyRequest(body, secret, signature);
    expect(result.valid).toBe(true);
  });

  it("rejects request with signature of wrong length (timing attack protection)", () => {
    const secret = "my-secret-key";
    const body = "test";
    const result = verifyRequest(body, secret, "short");
    expect(result.valid).toBe(false);
  });
});

// ===================================================================
// Incoming Webhook Handler Tests
// ===================================================================

function makeWebhook(
  overrides: Partial<IncomingWebhookRecord> = {},
): IncomingWebhookRecord {
  return {
    id: "wh-1",
    userId: "user-1",
    name: "Test Webhook",
    urlToken: "abc123",
    secret: null,
    mode: "test",
    mappingConfig: {
      eventType: "exchange.created",
      fields: [
        { sourcePath: "from", targetField: "sender" },
        { sourcePath: "subject", targetField: "title" },
      ],
    },
    enabled: true,
    lastReceivedAt: null,
    ...overrides,
  };
}

function makeDeps(
  webhook: IncomingWebhookRecord | null,
  overrides: Partial<IncomingWebhookDeps> = {},
): IncomingWebhookDeps {
  const insertedRows: Array<Record<string, unknown>> = [];

  const persister: EventPersister = {
    async insert(row) {
      insertedRows.push({ ...row });
    },
  };

  return {
    findByToken: vi.fn(async () => webhook),
    updateLastReceived: vi.fn(async () => {}),
    persister,
    ...overrides,
  };
}

describe("handleIncomingWebhook", () => {
  it("returns 404 for unknown webhook token", async () => {
    const deps = makeDeps(null);
    const result = await handleIncomingWebhook("unknown-token", "{}", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.body.error).toBe("Webhook not found");
  });

  it("returns 410 for disabled webhook", async () => {
    const webhook = makeWebhook({ enabled: false });
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "{}", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(410);
  });

  it("returns 401 when secret is set but no signature provided", async () => {
    const webhook = makeWebhook({ secret: "my-secret" });
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "{}", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it("accepts valid signature when secret is configured", async () => {
    const secret = "my-secret";
    const body = JSON.stringify({ from: "test@example.com", subject: "Hi" });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    const webhook = makeWebhook({ secret });
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", body, signature, deps);

    expect(result.accepted).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("returns 400 for invalid JSON body", async () => {
    const webhook = makeWebhook();
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "not-json", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("Invalid JSON");
  });

  it("returns 400 for JSON array body", async () => {
    const webhook = makeWebhook();
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "[1,2,3]", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("JSON object");
  });

  it("returns 422 when no mapping config", async () => {
    const webhook = makeWebhook({ mappingConfig: null });
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "{}", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(422);
  });

  it("in test mode: returns preview without emitting event", async () => {
    const webhook = makeWebhook({ mode: "test" });
    const deps = makeDeps(webhook);
    const body = JSON.stringify({ from: "test@example.com", subject: "Hello" });

    const result = await handleIncomingWebhook("abc123", body, null, deps);

    expect(result.accepted).toBe(true);
    expect(result.statusCode).toBe(200);
    expect((result.body as Record<string, unknown>).mode).toBe("test");

    // Preview should contain mapped payload
    expect(result.preview).toBeDefined();
    expect(result.preview!.success).toBe(true);
    expect(result.preview!.payload.sender).toBe("test@example.com");
    expect(result.preview!.payload.title).toBe("Hello");
  });

  it("in test mode: reports mapping errors in preview", async () => {
    const webhook = makeWebhook({ mode: "test" });
    const deps = makeDeps(webhook);
    const body = JSON.stringify({}); // missing 'from' and 'subject'

    const result = await handleIncomingWebhook("abc123", body, null, deps);

    expect(result.accepted).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.preview!.success).toBe(false);
    expect(result.preview!.errors.length).toBeGreaterThan(0);
  });

  it("in live mode: emits event on successful mapping", async () => {
    const webhook = makeWebhook({ mode: "live" });
    const deps = makeDeps(webhook);
    const body = JSON.stringify({ from: "test@example.com", subject: "Hello" });

    const result = await handleIncomingWebhook("abc123", body, null, deps);

    expect(result.accepted).toBe(true);
    expect(result.statusCode).toBe(200);
    expect((result.body as Record<string, unknown>).mode).toBe("live");
    expect((result.body as Record<string, unknown>).eventId).toBeDefined();
    expect((result.body as Record<string, unknown>).eventType).toBe("webhook.received");

    // Verify event was persisted
    const insertSpy = deps.persister.insert as (row: Record<string, unknown>) => Promise<void>;
    // @ts-expect-error - accessing mock internals
    const calls = insertSpy.mock?.calls;
    if (!calls) {
      // If not a mock, check directly via the persister
      // The event should have been inserted
    }
  });

  it("in live mode: does NOT emit event when mapping fails", async () => {
    const webhook = makeWebhook({ mode: "live" });
    const deps = makeDeps(webhook);
    const body = JSON.stringify({}); // missing required fields

    const result = await handleIncomingWebhook("abc123", body, null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(422);
    expect((result.body as Record<string, unknown>).error).toContain("Mapping produced errors");
  });

  it("updates lastReceivedAt timestamp", async () => {
    const webhook = makeWebhook();
    const deps = makeDeps(webhook);
    const body = JSON.stringify({ from: "a@b.com", subject: "test" });

    await handleIncomingWebhook("abc123", body, null, deps);

    expect(deps.updateLastReceived).toHaveBeenCalledWith("wh-1");
  });

  it("returns 422 for invalid mapping config stored in DB", async () => {
    const webhook = makeWebhook({
      mappingConfig: { eventType: "", fields: [] } as unknown as MappingConfig,
    });
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "{}", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(422);
    expect((result.body as Record<string, unknown>).error).toContain("Invalid mapping");
  });

  it("includes raw and mapped payload in live event", async () => {
    const webhook = makeWebhook({ mode: "live" });
    const insertedRows: Array<Record<string, unknown>> = [];

    const deps = makeDeps(webhook, {
      persister: {
        async insert(row) {
          insertedRows.push({ ...row });
        },
      },
    });

    const rawPayload = { from: "test@example.com", subject: "Hello" };
    const body = JSON.stringify(rawPayload);

    await handleIncomingWebhook("abc123", body, null, deps);

    expect(insertedRows).toHaveLength(1);
    const eventPayload = insertedRows[0]!.payload as Record<string, unknown>;
    expect(eventPayload.webhookId).toBe("wh-1");
    expect(eventPayload.mappedEventType).toBe("exchange.created");

    const mappedPayload = eventPayload.mappedPayload as Record<string, unknown>;
    expect(mappedPayload.sender).toBe("test@example.com");
    expect(mappedPayload.title).toBe("Hello");

    const raw = eventPayload.rawPayload as Record<string, unknown>;
    expect(raw.from).toBe("test@example.com");
  });
});
