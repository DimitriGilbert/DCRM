# Code Review Report — Cluster 7: Webhooks Engine

**Reviewer**: Code Review Expert (Security Focus)
**Date**: 2026-05-30
**Files Reviewed**:
1. `packages/webhooks/src/index.ts`
2. `packages/webhooks/src/outgoing.ts`
3. `packages/webhooks/src/auth.ts`
4. `packages/webhooks/src/incoming.ts`
5. `packages/webhooks/src/mapper.ts`
6. `packages/webhooks/__tests__/incoming.test.ts`
7. `packages/webhooks/__tests__/outgoing.test.ts`

---

## Summary

The webhooks engine is well-structured with clean separation of concerns: outgoing execution with retry logic, auth header resolution with encryption at rest, incoming verification with timing-safe comparison, and a flexible JSON-path mapper. The code uses `timingSafeEqual` correctly for HMAC comparison, encrypts all secrets via AES-256-GCM before storage, and properly validates incoming payloads.

**Two real issues were found** — both in `outgoing.ts` — relating to the gap between the documented non-throwing contract of `executeOutgoingWebhook` and the actual error-handling coverage.

---

### [SEVERITY: HIGH] Finding 1: `resolveAuthHeaders` errors escape the non-throwing contract of `executeOutgoingWebhook`

**File**: `packages/webhooks/src/outgoing.ts:167`
**Problem**: The `sendRequest` function's `try/catch` only wraps the `httpClient.fetch` call. Auth resolution (`resolveAuthHeaders`) and header merging happen **before** the try-catch. If auth resolution throws (malformed encrypted value, master key mismatch after rotation, corrupt DB data), the exception propagates uncaught through `executeOutgoingWebhook`, violating its documented contract.

The JSDoc explicitly states:
> *"This function does NOT throw — it always returns a result object so the caller can log appropriately."*

This contract violation means callers relying on the non-throwing guarantee (e.g., event processing pipelines that log and move on) will instead face unhandled rejections.

**Evidence**:
```typescript
// outgoing.ts:158-206 — sendRequest
async function sendRequest(
  config: OutgoingWebhookHookConfig,
  body: string,
  deps: OutgoingWebhookExecutorDeps,
  attempt: number,
): Promise<WebhookExecutionResult> {
  const start = performance.now();

  // ❌ OUTSIDE try-catch — can throw on corrupt/mismatched encrypted values
  const resolvedAuth = resolveAuthHeaders(config.auth, deps.crypto, body);

  const allHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {}),
    ...resolvedAuth.headers,
  };

  try {
    // ✅ Only fetch errors are caught
    const response = await deps.httpClient.fetch(config.url, { ... });
    // ...
  } catch (err) {
    // Auth resolution errors never reach here
    return { success: false, statusCode: null, error: errorMessage, ... };
  }
}
```

The `crypto.decrypt` in `resolveAuthHeaders` calls `createDecipheriv` + `setAuthTag` + `decipher.final()`. GCM's `final()` throws `Error: Unsupported state or unable to authenticate data` if the auth tag doesn't match (corrupt ciphertext, wrong key). This is a real operational scenario during master key rotation or DB data corruption.

**Impact**: Any caller depending on the "never throws" guarantee will have unhandled promise rejections in production. In an event processing loop, this could halt processing of subsequent events.

**Suggestion**: Move the auth resolution and header merging inside the try-catch:

```typescript
async function sendRequest(
  config: OutgoingWebhookHookConfig,
  body: string,
  deps: OutgoingWebhookExecutorDeps,
  attempt: number,
): Promise<WebhookExecutionResult> {
  const start = performance.now();

  try {
    const resolvedAuth = resolveAuthHeaders(config.auth, deps.crypto, body);

    const allHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers ?? {}),
      ...resolvedAuth.headers,
    };

    const response = await deps.httpClient.fetch(config.url, {
      method: config.method ?? "POST",
      headers: allHeaders,
      body,
      signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
    });

    const durationMs = Math.round(performance.now() - start);
    const success = response.status >= 200 && response.status < 300;

    return {
      success,
      statusCode: response.status,
      responseBody: response.body,
      attempt,
      durationMs,
      error: success ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const errorMessage = err instanceof Error ? err.message : String(err);

    return {
      success: false,
      statusCode: null,
      error: errorMessage,
      attempt,
      durationMs,
    };
  }
}
```

---

### [SEVERITY: MEDIUM] Finding 2: Unvalidated `maxRetries` can cause runtime crash (non-null assertion on undefined)

**File**: `packages/webhooks/src/outgoing.ts:79,115,141`
**Problem**: `parseConfig` passes `maxRetries` through from the raw JSONB config with only a `?? 3` null-coalescing fallback. No validation ensures it's a non-negative integer. If `maxRetries` is `-1` (from corrupt or manually edited DB data), then `maxAttempts = 0`, the retry loop body never executes, and `lastResult` remains `undefined`. The `lastResult!` non-null assertion then returns `undefined` to the caller — violating the return type `WebhookExecutionResult`.

**Evidence**:
```typescript
// outgoing.ts:79 — no bounds check
const maxRetries = raw["maxRetries"] as OutgoingWebhookHookConfig["maxRetries"];
// ...
return {
  // ...
  maxRetries: maxRetries ?? 3,  // ?? only catches null/undefined, NOT -1
};

// outgoing.ts:115
const maxAttempts = (config.maxRetries ?? 3) + 1;
// If config.maxRetries === -1 → maxAttempts === 0

// outgoing.ts:118-141
let lastResult: WebhookExecutionResult | undefined;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  // Never enters when maxAttempts === 0
  lastResult = result;
}

return lastResult!;  // ❌ undefined — crash or corrupt return value
```

Similarly, `timeoutMs` could be `0` (causing instant abort via `AbortSignal.timeout(0)`) or negative (undefined behavior), though this produces a degraded-but-functional result rather than a crash.

**Impact**: A webhook with a corrupted `maxRetries` value causes `executeOutgoingWebhook` to return `undefined` instead of a valid result. The caller gets an object where every property access returns `undefined`, likely causing confusing downstream errors. In the worst case, if the caller destructures `{ success }` from the result, `success` is `undefined` which is falsy — the webhook appears to have failed with no error information.

**Suggestion**: Add bounds validation in `parseConfig`:

```typescript
const rawMaxRetries = raw["maxRetries"];
const maxRetries =
  typeof rawMaxRetries === "number" && rawMaxRetries >= 0
    ? Math.min(Math.floor(rawMaxRetries), 10)  // cap at reasonable max
    : 3;

const rawTimeoutMs = raw["timeoutMs"];
const timeoutMs =
  typeof rawTimeoutMs === "number" && rawTimeoutMs > 0
    ? Math.min(rawTimeoutMs, 60_000)  // cap at 60s
    : 10_000;
```

---

## What Was Reviewed and Found Clean

The following areas were carefully examined and found to be correctly implemented:

- **HMAC signature verification** (`incoming.ts:80-113`): Uses `timingSafeEqual` for constant-time comparison. The length pre-check before `timingSafeEqual` is safe because SHA-256 hex output length (64 chars) is publicly known — no secret information is leaked by the short-circuit.
- **Encryption at rest** (`auth.ts`): All secrets (bearer tokens, basic auth credentials, HMAC secrets, custom header values) are encrypted via `CryptoService` (AES-256-GCM) before storage and decrypted only at dispatch time.
- **Payload injection prevention** (`incoming.ts:170-187`): Incoming payloads are validated to be JSON objects (not arrays, not primitives) before mapping.
- **JSON path traversal** (`mapper.ts:70-102`): The `extractValue` function safely handles null/undefined traversal, array bounds, and type mismatches — all returning `undefined` rather than throwing.
- **Mapping config validation** (`mapper.ts:237-284`): `validateMappingConfig` checks structural validity before applying mappings, preventing runtime crashes from corrupt DB configs.
- **Retry logic** (`outgoing.ts:109-142`): Exponential backoff with cap (1s → 60s max), correct transient failure classification (5xx and 429 only), proper loop termination.
- **Auth header precedence** (`outgoing.ts:170-174`): Resolved auth headers override custom config headers on collision — correct behavior documented in comment.
- **Test coverage**: Tests are comprehensive across auth modes, retry behavior, verification, mapping, and edge cases.
