# Verified Code Review Report — Clusters 10 (Webhooks) & 11 (Storage)

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Verification Agent**: Verification Agent — Report 10
**Files Reviewed**: 13 files across `packages/webhooks/` and `packages/storage/`
**Original Findings**: 5

---

## Verification Summary

| # | Original Severity | Title | Verdict |
|---|-------------------|-------|---------|
| 1 | HIGH | Test/code mismatch — 404 vs 410 for disabled webhook | **CONFIRMED** |
| 2 | HIGH | Path traversal via unvalidated `userId` in LocalStorageBackend | **CONFIRMED** (reduced context) |
| 3 | MEDIUM | TOCTOU race condition in quota enforcement | **CONFIRMED** |
| 4 | MEDIUM | Unsafe type assertions in `parseConfig` — silent auth bypass | **CONFIRMED** (mitigated upstream) |
| 5 | MEDIUM | Unvalidated `url` in `parseConfig` — SSRF risk | **CONFIRMED** (mitigated upstream) |

**Result**: 5 confirmed, 0 dismissed

---

## Detailed Verification

---

### Finding 1: Test/code mismatch — disabled webhook returns 404 but test expects 410 — CONFIRMED

**Original**: The handler returns HTTP 404 for a disabled webhook, but the test expects HTTP 410 (Gone). This test will fail when run.

**Verification**: Fully confirmed. The code and test are in direct conflict.

**Code evidence** (`packages/webhooks/src/incoming.ts:150-156`):
```typescript
if (!webhook.enabled) {
    return {
      accepted: false,
      statusCode: 404,           // ← returns 404
      body: { error: "Webhook not found" },
    };
  }
```

**Test evidence** (`packages/webhooks/__tests__/incoming.test.ts:510-517`):
```typescript
it("returns 410 for disabled webhook", async () => {
    const webhook = makeWebhook({ enabled: false });
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "{}", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(410);   // ← expects 410
  });
```

The code intentionally returns 404 (hiding the existence of the disabled webhook), while the test name and assertion both expect 410 (semantically "Gone"). This is not a false positive — these two will definitely disagree at runtime. The test description "returns 410 for disabled webhook" makes clear that 410 was the intended behavior, but the implementation chose 404 instead.

**Verdict**: CONFIRMED — real test/code mismatch that will cause test failure.

---

### Finding 2: Path traversal via `userId` parameter in LocalStorageBackend — CONFIRMED

**Original**: The `validateKey` method validates the `key` parameter for path traversal but `userId` is concatenated into the filesystem path without validation.

**Verification**: Confirmed. The defense-in-depth gap is real and verifiable in code.

**Code evidence** (`packages/storage/src/local.ts:207-209`):
```typescript
private resolvePath(userId: string, key: string): string {
    return `${this.baseDir}/${userId}/${key}`;
}
```

**Key validation exists** (`packages/storage/src/local.ts:222-229`):
```typescript
private validateKey(key: string): void {
    if (key.startsWith("/")) {
      throw new StorageError("Key must not be absolute", "PUT_FAILED");
    }
    if (key.includes("..")) {
      throw new StorageError("Key must not contain path traversal segments", "PUT_FAILED");
    }
}
```

**No equivalent `validateUserId` exists** — the class documentation at line 119 even states "Path traversal is mitigated by rejecting keys containing `..` or absolute paths" — but this only covers `key`, not `userId`.

**Upstream context**: The `userId` comes from `ctx.user.id` in API callers (e.g., `packages/api/src/routers/attachment/download.ts:28`: `backend.get(ctx.user.id, row.filePath)`). Better Auth generates UUID-like user IDs, making direct exploitation extremely unlikely. However:
1. The `StorageBackend` interface is generic — any future caller could pass unvalidated input
2. The asymmetry (validate `key` but not `userId`) creates a false sense of security
3. A bug in any upstream caller instantly becomes a filesystem escape vector

**Verdict**: CONFIRMED — real defense-in-depth gap. Practical exploitation risk is low due to auth-sourced userId, but the storage layer should not depend on its callers for input safety.

---

### Finding 3: TOCTOU race condition in quota enforcement — CONFIRMED

**Original**: The quota check is a check-then-act sequence without locking. Two concurrent uploads can both pass the quota check before either writes data.

**Verification**: Confirmed. The race condition exists in both backends.

**Code evidence** (`packages/storage/src/local.ts:152-165`):
```typescript
if (this.limits.userQuota !== null) {
    const currentUsage = await this.calculateUsage(userId);      // Step 1: read
    if (currentUsage + data.byteLength > this.limits.userQuota) { // Step 2: check
      throw new StorageError(...);
    }
}
// ... no lock ...
const fullPath = this.resolvePath(userId, key);
await this.fsOps.put(fullPath, data);  // Step 3: write
```

Same pattern in `packages/storage/src/s3.ts:99-117`.

In Node.js, two concurrent `put()` calls for the same user will interleave at `await` boundaries. Both calls can read `currentUsage` before either writes, both pass the quota check, and both write — exceeding the quota by up to `maxFileSize` bytes. This is a classic TOCTOU (Time-of-check to time-of-use) pattern.

Practical impact in a single-user CRM is low — concurrent uploads to the same user account are rare. But the code pattern is correct, and batch file uploads from a UI or simultaneous mobile+desktop usage could trigger it.

**Verdict**: CONFIRMED — real race condition. Low practical impact given single-user context, but a correctness violation.

---

### Finding 4: Unsafe type assertions in `parseConfig` allow silent auth bypass — CONFIRMED (mitigated upstream)

**Original**: `parseConfig` uses `as` type assertions on raw config values from the database without runtime validation. An invalid auth mode silently falls through to the `default` case in `resolveAuthHeaders`, returning empty headers — the webhook fires with no authentication.

**Verification**: Confirmed — the code path exists as described. However, upstream API-layer validation provides significant mitigation.

**Code evidence** (`packages/webhooks/src/outgoing.ts:72-87`):
```typescript
const auth = raw["auth"] ?? { mode: "none" };
if (typeof auth !== "object" || auth === null) {
    throw new Error(`Invalid webhook config: "auth" must be an object`);
}
// ...
return {
    url,
    auth: auth as OutgoingWebhookHookConfig["auth"], // ← no mode validation
    method: method ?? "POST",
    // ...
};
```

The `default` branch in `resolveAuthHeaders` (`packages/webhooks/src/auth.ts:117-121`):
```typescript
default: {
    const _: never = auth;
    void _;
    return { headers: {} }; // ← silently returns no auth
}
```

At runtime, TypeScript's `never` is erased — if `auth.mode` is an invalid string like `"baerer"`, the `default` branch executes and returns empty headers. The webhook fires unauthenticated.

**Mitigating factor**: The API layer validates auth config before storing it. `packages/api/src/routers/webhook/schemas.ts:4-45` uses Zod schemas with discriminated unions on `mode` literals:
```typescript
authMode: outgoingWebhookAuthModeSchema.optional().default("custom_headers"),
authConfig: z.union([
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("bearer"), token: z.string().min(1) }),
    // ... etc
]).optional().default({ mode: "none" }),
```

This means normal API flows will never store an invalid auth mode. However, `parseConfig` reads directly from the database JSONB field (`hook.config`), bypassing any schema that may have been applied at write time. Corrupted data from migrations, manual DB edits, or backup restores would not be caught.

**Verdict**: CONFIRMED — real defense-in-depth gap. The API layer mitigates normal-flow risk, but `parseConfig` should validate `auth.mode` at parse time to guard against corrupted stored data. Severity remains MEDIUM because the upstream Zod validation provides reasonable protection.

---

### Finding 5: `parseConfig` accepts unvalidated `url` — SSRF risk — CONFIRMED (mitigated upstream)

**Original**: The `url` field is validated only for being a non-empty string. No scheme or internal-address validation.

**Verification**: Confirmed — `parseConfig` performs no URL validation. The API layer validates URL format but allows HTTP and doesn't block internal addresses.

**Code evidence** (`packages/webhooks/src/outgoing.ts:67-69`):
```typescript
const url = raw["url"];
if (typeof url !== "string" || url.length === 0) {
    throw new Error(`Invalid webhook config: missing or empty "url"`);
}
// No scheme validation, no internal address blocklist
```

**Upstream API validation** (`packages/api/src/routers/webhook/schemas.ts:8-11`):
```typescript
url: z.string().min(1).max(2048).url().refine(
    (val) => val.startsWith("https://") || val.startsWith("http://"),
    { message: "URL must use http or https scheme" },
),
```

The API schema validates:
- It's a valid URL (via `.url()`)
- It uses `http://` or `https://` scheme
- Max length 2048

But it does **not** block:
- `http://` URLs (credentials could be sent over plaintext)
- Internal/private addresses (`http://169.254.169.254/metadata`, `http://localhost:3000`, `http://10.0.0.1/admin`)

And `parseConfig` itself performs zero URL validation — if data is corrupted in the database, no URL validation occurs at consumption time.

In a single-user CRM, the user configures their own webhooks (self-attack). But cloud metadata endpoints (169.254.169.254) could leak cloud credentials if an attacker gains session access.

**Verdict**: CONFIRMED — real gap. The API layer provides partial mitigation (valid URL format, http/https scheme), but internal address blocking is missing, and `parseConfig` performs no validation of its own. Severity remains MEDIUM given single-user context.

---

## Final Summary

| Finding | Verdict | Notes |
|---------|---------|-------|
| 1. Test/code mismatch (404 vs 410) | **CONFIRMED** | Will cause test failure. Code and test directly contradict. |
| 2. Path traversal via `userId` | **CONFIRMED** | Defense-in-depth gap. `key` validated, `userId` not. Low exploitation risk due to auth context. |
| 3. TOCTOU race in quota check | **CONFIRMED** | Real race condition. Low practical impact in single-user context. |
| 4. Silent auth bypass via `as` assertion | **CONFIRMED** | Real code path. Mitigated by API-level Zod validation but `parseConfig` should validate independently. |
| 5. SSRF via unvalidated URL | **CONFIRMED** | `parseConfig` does no URL validation. API layer partially validates but allows HTTP and internal addresses. |

**5 confirmed, 0 dismissed.**

All five findings are genuine issues visible in the source code. Findings 2, 4, and 5 have mitigating factors that reduce their immediate severity (auth-sourced userId, API-layer Zod validation), but all represent real defense-in-depth gaps that should be addressed for production-grade code.
