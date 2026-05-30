import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { createCrypto } from "@DCRM/crypto";

import {
  resolveAuthHeaders,
  encryptBearerToken,
  encryptBasicAuth,
  encryptHmacAuth,
  encryptCustomHeaders,
  type OutgoingWebhookAuthConfig,
} from "../src/auth";

import {
  executeOutgoingWebhook,
  isTransientFailure,
  type HttpClient,
  type OutgoingWebhookExecutorDeps,
} from "../src/outgoing";

import type { DcrmEvent, HookRecord } from "@DCRM/events";

// --- Test crypto service ---

const MASTER_KEY = "test-master-key-at-least-32-chars!!";
const crypto = createCrypto(MASTER_KEY);

// --- Auth tests ---

describe("resolveAuthHeaders", () => {
  it("returns empty headers for 'none' auth mode", () => {
    const result = resolveAuthHeaders({ mode: "none" }, crypto, "{}");
    expect(result.headers).toEqual({});
  });

  it("returns Bearer Authorization header", () => {
    const auth = encryptBearerToken("my-secret-token", crypto);
    const result = resolveAuthHeaders(auth, crypto, "{}");
    expect(result.headers["Authorization"]).toBe("Bearer my-secret-token");
  });

  it("returns Basic Authorization header", () => {
    const auth = encryptBasicAuth("myuser", "mypass123", crypto);
    const result = resolveAuthHeaders(auth, crypto, "{}");
    const expected = `Basic ${Buffer.from("myuser:mypass123").toString("base64")}`;
    expect(result.headers["Authorization"]).toBe(expected);
  });

  it("returns HMAC signature header with sha256", () => {
    const auth = encryptHmacAuth("hmac-secret-key", "X-Signature-256", "sha256", crypto);
    const body = JSON.stringify({ test: true });
    const result = resolveAuthHeaders(auth, crypto, body);

    const expectedSig = createHmac("sha256", "hmac-secret-key").update(body).digest("hex");
    expect(result.headers["X-Signature-256"]).toBe(expectedSig);
  });

  it("returns HMAC signature header with sha512", () => {
    const auth = encryptHmacAuth("hmac-secret-key", "X-Sig", "sha512", crypto);
    const body = "test-body";
    const result = resolveAuthHeaders(auth, crypto, body);

    const expectedSig = createHmac("sha512", "hmac-secret-key").update(body).digest("hex");
    expect(result.headers["X-Sig"]).toBe(expectedSig);
  });

  it("returns custom headers", () => {
    const auth = encryptCustomHeaders(
      [
        { name: "X-Api-Key", value: "key-123" },
        { name: "X-Custom", value: "custom-val" },
      ],
      crypto,
    );
    const result = resolveAuthHeaders(auth, crypto, "{}");
    expect(result.headers["X-Api-Key"]).toBe("key-123");
    expect(result.headers["X-Custom"]).toBe("custom-val");
  });

  it("produces different encrypted values for the same plaintext", () => {
    const auth1 = encryptBearerToken("same-token", crypto);
    const auth2 = encryptBearerToken("same-token", crypto);
    // Different IVs produce different ciphertext
    expect(auth1.encryptedToken.ciphertext).not.toBe(auth2.encryptedToken.ciphertext);
    // But both decrypt to the same value
    const r1 = resolveAuthHeaders(auth1, crypto, "{}");
    const r2 = resolveAuthHeaders(auth2, crypto, "{}");
    expect(r1.headers["Authorization"]).toBe(r2.headers["Authorization"]);
  });
});

// --- Encryption helper tests ---

describe("encryption helpers", () => {
  it("encryptBearerToken produces a valid BearerAuthConfig", () => {
    const result = encryptBearerToken("tok", crypto);
    expect(result.mode).toBe("bearer");
    expect(result.encryptedToken.ciphertext).toBeDefined();
    expect(result.encryptedToken.iv).toBeDefined();
    expect(result.encryptedToken.authTag).toBeDefined();
    expect(result.encryptedToken.version).toBe(1);
  });

  it("encryptBasicAuth produces a valid BasicAuthConfig", () => {
    const result = encryptBasicAuth("u", "p", crypto);
    expect(result.mode).toBe("basic");
    expect(result.encryptedUsername).toBeDefined();
    expect(result.encryptedPassword).toBeDefined();
  });

  it("encryptHmacAuth produces a valid HmacAuthConfig", () => {
    const result = encryptHmacAuth("secret", "X-Sig", "sha256", crypto);
    expect(result.mode).toBe("hmac");
    expect(result.headerName).toBe("X-Sig");
    expect(result.algorithm).toBe("sha256");
    expect(result.encryptedSecret).toBeDefined();
  });

  it("encryptHmacAuth defaults algorithm to sha256", () => {
    const result = encryptHmacAuth("secret", "X-Sig", undefined, crypto);
    expect(result.algorithm).toBe("sha256");
  });

  it("encryptCustomHeaders produces a valid CustomHeadersAuthConfig", () => {
    const result = encryptCustomHeaders(
      [{ name: "X-Key", value: "val" }],
      crypto,
    );
    expect(result.mode).toBe("custom_headers");
    expect(result.headers).toHaveLength(1);
    expect(result.headers[0]!.name).toBe("X-Key");
  });
});

// --- Transient failure detection ---

describe("isTransientFailure", () => {
  it("marks network errors (null status) as transient", () => {
    expect(isTransientFailure(null, new Error("ECONNREFUSED"))).toBe(true);
  });

  it("marks 500 as transient", () => {
    expect(isTransientFailure(500, undefined)).toBe(true);
  });

  it("marks 502 as transient", () => {
    expect(isTransientFailure(502, undefined)).toBe(true);
  });

  it("marks 503 as transient", () => {
    expect(isTransientFailure(503, undefined)).toBe(true);
  });

  it("marks 429 as transient", () => {
    expect(isTransientFailure(429, undefined)).toBe(true);
  });

  it("does NOT mark 400 as transient", () => {
    expect(isTransientFailure(400, undefined)).toBe(false);
  });

  it("does NOT mark 401 as transient", () => {
    expect(isTransientFailure(401, undefined)).toBe(false);
  });

  it("does NOT mark 404 as transient", () => {
    expect(isTransientFailure(404, undefined)).toBe(false);
  });

  it("does NOT mark 200 as transient", () => {
    expect(isTransientFailure(200, undefined)).toBe(false);
  });
});

// --- Executor tests ---

function makeEvent(overrides?: Partial<DcrmEvent>): DcrmEvent {
  return {
    id: "evt-1",
    type: "client.created",
    userId: "user-1",
    source: "app",
    payload: { name: "Test Client" },
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeHook(
  configOverrides?: Record<string, unknown>,
): HookRecord {
  return {
    id: "hook-1",
    userId: "user-1",
    name: "Test Webhook",
    type: "outgoing_webhook",
    eventType: "client.created",
    enabled: true,
    config: {
      url: "https://example.com/webhook",
      auth: { mode: "none" },
      ...configOverrides,
    },
    maxRetries: 2,
  };
}

function makeMockHttpClient(
  responses: Array<{ status: number; body?: string }>,
): HttpClient & { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let idx = 0;

  return {
    calls,
    async fetch(url: string, init: RequestInit) {
      calls.push({ url, init });
      const resp = responses[idx] ?? { status: 200, body: "ok" };
      idx++;
      return { status: resp.status, body: resp.body ?? "ok" };
    },
  };
}

function makeDeps(client: HttpClient): OutgoingWebhookExecutorDeps {
  return { crypto, httpClient: client };
}

describe("executeOutgoingWebhook", () => {
  it("sends a successful webhook on first attempt", async () => {
    const client = makeMockHttpClient([{ status: 200, body: "ok" }]);
    const result = await executeOutgoingWebhook(
      makeHook(),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.attempt).toBe(1);
    expect(client.calls).toHaveLength(1);
  });

  it("includes event data in the request body", async () => {
    const client = makeMockHttpClient([{ status: 200 }]);
    await executeOutgoingWebhook(makeHook(), makeEvent(), makeDeps(client));

    const body = JSON.parse(client.calls[0]!.init.body as string) as Record<string, unknown>;
    expect(body.id).toBe("evt-1");
    expect(body.type).toBe("client.created");
    expect(body.payload).toEqual({ name: "Test Client" });
  });

  it("retries on 500 and succeeds on second attempt", async () => {
    const client = makeMockHttpClient([
      { status: 500, body: "error" },
      { status: 200, body: "ok" },
    ]);

    const result = await executeOutgoingWebhook(
      makeHook({ maxRetries: 2 }),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.success).toBe(true);
    expect(result.attempt).toBe(2);
    expect(client.calls).toHaveLength(2);
  });

  it("retries on network error and succeeds on later attempt", async () => {
    let callCount = 0;
    const client: HttpClient = {
      async fetch(url, init) {
        callCount++;
        if (callCount === 1) throw new Error("ECONNREFUSED");
        return { status: 200, body: "ok" };
      },
    };

    const result = await executeOutgoingWebhook(
      makeHook({ maxRetries: 2 }),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.success).toBe(true);
    expect(result.attempt).toBe(2);
  });

  it("does NOT retry on 400 client error", async () => {
    const client = makeMockHttpClient([{ status: 400, body: "bad" }]);

    const result = await executeOutgoingWebhook(
      makeHook({ maxRetries: 3 }),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.attempt).toBe(1);
    expect(client.calls).toHaveLength(1);
  });

  it("does NOT retry on 401 unauthorized", async () => {
    const client = makeMockHttpClient([{ status: 401, body: "unauthorized" }]);

    const result = await executeOutgoingWebhook(
      makeHook({ maxRetries: 3 }),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(client.calls).toHaveLength(1);
  });

  it("returns failure after all retries exhausted", async () => {
    const client = makeMockHttpClient([
      { status: 500 },
      { status: 503 },
      { status: 502 },
    ]);

    const result = await executeOutgoingWebhook(
      makeHook({ maxRetries: 2 }),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(502);
    expect(result.attempt).toBe(3);
    expect(client.calls).toHaveLength(3);
  });

  it("sends bearer auth header when configured", async () => {
    const auth = encryptBearerToken("my-token-123", crypto);
    const client = makeMockHttpClient([{ status: 200 }]);
    const hook = makeHook({ auth });

    await executeOutgoingWebhook(hook, makeEvent(), makeDeps(client));

    const headers = client.calls[0]!.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-token-123");
  });

  it("sends HMAC signature header when configured", async () => {
    const auth = encryptHmacAuth("hmac-key", "X-Sig", "sha256", crypto);
    const client = makeMockHttpClient([{ status: 200 }]);
    const hook = makeHook({ auth });

    const event = makeEvent();
    await executeOutgoingWebhook(hook, event, makeDeps(client));

    const headers = client.calls[0]!.init.headers as Record<string, string>;
    const body = client.calls[0]!.init.body as string;
    const expectedSig = createHmac("sha256", "hmac-key").update(body).digest("hex");
    expect(headers["X-Sig"]).toBe(expectedSig);
  });

  it("sends custom headers alongside auth headers", async () => {
    const auth = encryptBearerToken("tok", crypto);
    const client = makeMockHttpClient([{ status: 200 }]);
    const hook = makeHook({
      auth,
      headers: { "X-Custom": "custom-value" },
    });

    await executeOutgoingWebhook(hook, makeEvent(), makeDeps(client));

    const headers = client.calls[0]!.init.headers as Record<string, string>;
    expect(headers["X-Custom"]).toBe("custom-value");
    expect(headers["Authorization"]).toBe("Bearer tok");
  });

  it("sends Content-Type application/json by default", async () => {
    const client = makeMockHttpClient([{ status: 200 }]);

    await executeOutgoingWebhook(makeHook(), makeEvent(), makeDeps(client));

    const headers = client.calls[0]!.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("uses POST method by default", async () => {
    const client = makeMockHttpClient([{ status: 200 }]);

    await executeOutgoingWebhook(makeHook(), makeEvent(), makeDeps(client));

    expect(client.calls[0]!.init.method).toBe("POST");
  });

  it("respects custom HTTP method", async () => {
    const client = makeMockHttpClient([{ status: 200 }]);
    const hook = makeHook({ method: "PUT" });

    await executeOutgoingWebhook(hook, makeEvent(), makeDeps(client));

    expect(client.calls[0]!.init.method).toBe("PUT");
  });

  it("reports duration in result", async () => {
    const client = makeMockHttpClient([{ status: 200 }]);

    const result = await executeOutgoingWebhook(
      makeHook(),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws on invalid config (missing URL)", async () => {
    const client = makeMockHttpClient([{ status: 200 }]);
    const hook = makeHook({ url: "" });

    await expect(
      executeOutgoingWebhook(hook, makeEvent(), makeDeps(client)),
    ).rejects.toThrow(`Invalid webhook config`);
  });

  it("retries 429 rate-limited responses", async () => {
    const client = makeMockHttpClient([
      { status: 429, body: "rate limited" },
      { status: 200, body: "ok" },
    ]);

    const result = await executeOutgoingWebhook(
      makeHook({ maxRetries: 2 }),
      makeEvent(),
      makeDeps(client),
    );

    expect(result.success).toBe(true);
    expect(result.attempt).toBe(2);
    expect(client.calls).toHaveLength(2);
  });
});
