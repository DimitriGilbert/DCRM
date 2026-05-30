# Verified Code Review Report — Cluster 7: Webhooks Engine

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-7.md`

---

## Verification Summary

| # | Finding | Severity | Verdict | Reason |
|---|---------|----------|---------|--------|
| 1 | `resolveAuthHeaders` errors escape non-throwing contract | HIGH | ✅ CONFIRMED | Code at line 167 is provably outside the try-catch at line 176. `crypto.decrypt` throws on corrupt data. |
| 2 | Unvalidated `maxRetries` causes `undefined` return | MEDIUM | ✅ CONFIRMED | Math is verified: `-1` → `maxAttempts=0` → loop skipped → `lastResult!` is `undefined`. |

---

## Finding 1: CONFIRMED — `resolveAuthHeaders` errors escape the non-throwing contract

**Severity**: HIGH (unchanged)

### Evidence Verified

**Source**: `packages/webhooks/src/outgoing.ts`

1. **The contract is real** — Line 106-107 JSDoc states: *"This function does NOT throw — it always returns a result object so the caller can log appropriately."*

2. **The gap is real** — `sendRequest()` at line 158-207:
   - Line 167: `const resolvedAuth = resolveAuthHeaders(config.auth, deps.crypto, body);` — **OUTSIDE** the try-catch
   - Line 176: `try {` — the try-catch begins AFTER auth resolution
   - Only `deps.httpClient.fetch` (line 177) and its response handling are inside the try-catch

3. **`crypto.decrypt` CAN throw** — Verified in `packages/crypto/src/encrypt.ts:73-87`:
   - Line 85: `decipher.final()` — GCM's `final()` throws `Error: Unsupported state or unable to authenticate data` when the auth tag doesn't match (corrupt ciphertext, wrong key after rotation)
   - This is not theoretical — it's the standard Node.js AES-256-GCM authentication failure path

4. **`resolveAuthHeaders` directly calls `crypto.decrypt`** — Verified in `packages/webhooks/src/auth.ts`:
   - Line 88: `crypto.decrypt(auth.encryptedToken)` (Bearer mode)
   - Line 93-94: `crypto.decrypt(auth.encryptedUsername)` / `crypto.decrypt(auth.encryptedPassword)` (Basic mode)
   - Line 100: `crypto.decrypt(auth.encryptedSecret)` (HMAC mode)
   - Line 112: `crypto.decrypt(h.encryptedValue)` (Custom headers mode)

5. **Error propagation path**: `crypto.decrypt` throws → `resolveAuthHeaders` (no catch) → `sendRequest` (no catch at that line) → `executeOutgoingWebhook` (no catch) → caller gets unhandled rejection

**Verdict**: The report is 100% accurate. The non-throwing contract is violated for auth resolution failures. The suggested fix (moving auth resolution inside the try-catch) is correct.

---

## Finding 2: CONFIRMED — Unvalidated `maxRetries` can cause `undefined` return

**Severity**: MEDIUM (unchanged)

### Evidence Verified

**Source**: `packages/webhooks/src/outgoing.ts`

1. **`parseConfig` has no bounds check** — Line 80: `const maxRetries = raw["maxRetries"] as OutgoingWebhookHookConfig["maxRetries"];` — This is a bare `as` type assertion with no runtime validation.

2. **The null-coalescing fallback doesn't help** — Line 88: `maxRetries: maxRetries ?? 3` — The `??` operator only catches `null` and `undefined`, not `-1`.

3. **The math is verified**:
   - If `raw["maxRetries"] === -1`:
   - `config.maxRetries = -1` (passes through `?? 3`)
   - Line 115: `maxAttempts = (-1) + 1 = 0`
   - Line 120: `for (let attempt = 1; attempt <= 0; attempt++)` — **never enters**
   - Line 141: `return lastResult!;` — `lastResult` is `undefined` → returns `undefined` as `WebhookExecutionResult`

4. **Plausibility**: The `raw` argument to `parseConfig` comes from `hook.config` (line 114), which is a JSONB column from the database. While the tRPC API likely validates this at creation time, direct DB edits or migration errors could inject invalid values.

**Verdict**: The report is accurate. The bug is real — though it requires corrupt DB data to trigger. The suggested validation in `parseConfig` is a reasonable fix.

---

## Items Verified as Clean

The following were cross-checked against source and confirmed correct:

- **`timingSafeEqual` usage** (`incoming.ts:102-105`): Correct constant-time comparison with safe length pre-check.
- **Encryption at rest** (`auth.ts`): All secrets encrypted via `CryptoService` before storage.
- **Payload validation** (`incoming.ts:172-173`): Correctly rejects arrays and primitives with `Array.isArray` check.
- **JSON path traversal safety** (`mapper.ts:83-98`): Safe null/undefined/Array guards at each traversal step.
- **Mapping config validation** (`mapper.ts:237-284`): Thorough structural validation before applying mappings.
- **Retry logic** (`outgoing.ts:120-141`): Exponential backoff correctly capped, transient failure classification correct.
- **Auth header precedence** (`outgoing.ts:170-174`): Auth headers correctly override custom headers on collision.
