# Code Review Report — Clusters 10 (Webhooks) & 11 (Storage)

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Files Reviewed**: 13 files across `packages/webhooks/` and `packages/storage/`

---

## Findings: 5

---

### [SEVERITY: HIGH] Finding 1: Test/code mismatch — disabled webhook returns 404 but test expects 410

**File**: `packages/webhooks/src/incoming.ts:150-156` vs `packages/webhooks/__tests__/incoming.test.ts:510-517`

**Problem**: The handler returns HTTP 404 for a disabled webhook, but the test expects HTTP 410 (Gone). This test **will fail** when run. Either the code or the test is wrong — they need to agree.

**Evidence**:

Code (`incoming.ts:150-156`):
```typescript
if (!webhook.enabled) {
    return {
      accepted: false,
      statusCode: 404,
      body: { error: "Webhook not found" },
    };
  }
```

Test (`incoming.test.ts:510-517`):
```typescript
it("returns 410 for disabled webhook", async () => {
    const webhook = makeWebhook({ enabled: false });
    const deps = makeDeps(webhook);
    const result = await handleIncomingWebhook("abc123", "{}", null, deps);

    expect(result.accepted).toBe(false);
    expect(result.statusCode).toBe(410);
  });
```

**Impact**: Test suite will fail at this assertion. The semantic intent is unclear — returning 404 hides the existence of the disabled webhook (good for information-hiding), while 410 (Gone) is semantically more precise but leaks that the webhook existed. Either is defensible, but code and test must agree.

**Suggestion**: Decide on the correct status code. If intentionally returning 404 for information-hiding, update the test to expect 404. If 410 is intended, update the code. The test description "returns 410 for disabled webhook" suggests 410 was the original intent:
```typescript
// If 410 is intended:
if (!webhook.enabled) {
    return {
      accepted: false,
      statusCode: 410,
      body: { error: "Webhook is disabled" },
    };
  }
```

---

### [SEVERITY: HIGH] Finding 2: Path traversal via `userId` parameter in LocalStorageBackend

**File**: `packages/storage/src/local.ts:207-209`

**Problem**: The `validateKey` method validates the `key` parameter for path traversal (`..`) and absolute paths, but the `userId` parameter is concatenated into the filesystem path **without any validation**. A malicious or malformed `userId` containing `../` segments allows writing/reading files outside the designated `baseDir`.

**Evidence**:
```typescript
private resolvePath(userId: string, key: string): string {
    return `${this.baseDir}/${userId}/${key}`;
}
```
No validation on `userId` before concatenation. The `validateKey` is called on every public method, but only validates the `key` argument.

Example attack: If `userId = "../../etc"` and `key = "passwd"`, the resolved path becomes `baseDir/../../etc/passwd`, escaping `baseDir` entirely.

**Impact**: In this single-user CRM, the `userId` is sourced from auth context, making direct exploitation unlikely. However:
1. A bug in any caller passing an unvalidated `userId` becomes an instant filesystem escape.
2. Defense-in-depth is broken — the `key` is validated but `userId` is not, creating a false sense of security.
3. Files could be read from or written to arbitrary locations on the filesystem.

**Suggestion**: Add `userId` validation mirroring the `key` validation:
```typescript
private validateUserId(userId: string): void {
    if (userId.includes("..") || userId.includes("/") || userId.includes("\\")) {
      throw new StorageError("Invalid user ID", "PUT_FAILED");
    }
    if (userId.length === 0) {
      throw new StorageError("User ID must not be empty", "PUT_FAILED");
    }
}
```
Call it from every public method alongside `validateKey`. Alternatively, use `path.resolve` and verify the result starts with `baseDir`:
```typescript
private resolvePath(userId: string, key: string): string {
    const resolved = path.resolve(this.baseDir, userId, key);
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new StorageError("Path escapes base directory", "PUT_FAILED");
    }
    return resolved;
}
```

---

### [SEVERITY: MEDIUM] Finding 3: TOCTOU race condition in quota enforcement

**File**: `packages/storage/src/local.ts:152-160` and `packages/storage/src/s3.ts:99-107`

**Problem**: The quota check is a two-step sequence — calculate current usage, then check against limit — without any locking or atomicity. Two concurrent uploads can both pass the quota check before either writes data, resulting in the combined size exceeding the configured quota.

**Evidence** (local.ts):
```typescript
if (this.limits.userQuota !== null) {
    const currentUsage = await this.calculateUsage(userId);      // Step 1: read
    if (currentUsage + data.byteLength > this.limits.userQuota) { // Step 2: check
      throw new StorageError(...);
    }
}
// ... then write the file
await this.fsOps.put(fullPath, data);  // Step 3: write (no lock between check and write)
```

Same pattern in s3.ts lines 99-107.

**Impact**: In a single-user CRM with typical usage patterns, concurrent uploads are rare but not impossible (e.g., batch file uploads from a UI, or a mobile app and desktop app uploading simultaneously). The quota can be exceeded by up to `maxFileSize * (concurrency - 1)` bytes. This is a correctness violation rather than a security issue.

**Suggestion**: For the local backend, consider using an in-memory usage tracker that is updated atomically (using a mutex or single-threaded event loop guarantees in Node.js). For S3, quota enforcement is inherently eventual-consistent; consider either accepting the limitation with documentation, or implementing server-side quota tracking in the database rather than listing all S3 objects on every upload.

---

### [SEVERITY: MEDIUM] Finding 4: Unsafe type assertions in `parseConfig` allow silent auth bypass

**File**: `packages/webhooks/src/outgoing.ts:66-93`

**Problem**: The `parseConfig` function uses `as` type assertions on raw config values from the database without runtime validation. Most critically, the `auth` field is cast with `auth as OutgoingWebhookHookConfig["auth"]` without checking its `mode` value. If the stored config is corrupted or was set through a buggy API, an invalid auth mode silently falls through to the `default` case in `resolveAuthHeaders`, which returns **empty headers** — the webhook fires with no authentication.

**Evidence**:
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

In `resolveAuthHeaders`, the `default` branch (auth.ts:117-121):
```typescript
default: {
    const _: never = auth;
    void _;
    return { headers: {} }; // ← silently returns no auth
}
```

At runtime, if `auth.mode` is a typo like `"baerer"`, the `never` assignment doesn't fail — it just returns empty headers.

**Impact**: A webhook configured with auth that has a corrupted or typoed mode will silently execute without authentication. The outgoing webhook fires to the external service with no auth headers, potentially exposing the endpoint to unauthorized access or sending sensitive event data unauthenticated.

**Suggestion**: Validate the auth mode at runtime in `parseConfig`:
```typescript
const validModes = new Set(["none", "bearer", "basic", "hmac", "custom_headers"]);
if (!validModes.has((auth as Record<string, unknown>)["mode"] as string)) {
    throw new Error(`Invalid webhook config: unsupported auth mode`);
}
```
Or better, use the `OUTGOING_WEBHOOK_AUTH_MODES` constant and `outgoingWebhookAuthModeSchema` from `@DCRM/domain` to validate at parse time.

---

### [SEVERITY: MEDIUM] Finding 5: `parseConfig` accepts unvalidated `url` — SSRF risk

**File**: `packages/webhooks/src/outgoing.ts:67-69`

**Problem**: The `url` field from the hook config is validated only for being a non-empty string. There is no validation that it is an `https://` URL, or that it doesn't target internal network addresses (e.g., `http://169.254.169.254/metadata`, `http://localhost:3000`, `http://10.0.0.1/admin`). An outgoing webhook configured with an internal URL could be used to probe or interact with internal services.

**Evidence**:
```typescript
const url = raw["url"];
if (typeof url !== "string" || url.length === 0) {
    throw new Error(`Invalid webhook config: missing or empty "url"`);
}
// No scheme validation, no internal address blocklist
```

The URL is then used directly in `sendRequest`:
```typescript
const response = await deps.httpClient.fetch(config.url, { ... });
```

**Impact**: In a single-user CRM, the user configures their own outgoing webhooks, so they are attacking their own system. However:
1. If webhook URLs are ever shared/importable (e.g., from a template), they become an SSRF vector.
2. An attacker who compromises the user's session can use outgoing webhooks to scan the internal network.
3. Cloud metadata endpoints (169.254.169.254) could leak cloud credentials.

**Suggestion**: Add URL scheme and host validation:
```typescript
const parsed = new URL(url);
if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
}
// Optional: block private/internal ranges
```
At minimum, enforce HTTPS to prevent credentials from being sent over plain HTTP.

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | HIGH | `webhooks/src/incoming.ts` / `__tests__/incoming.test.ts` | Test expects 410 but code returns 404 for disabled webhook — test will fail |
| 2 | HIGH | `storage/src/local.ts` | Path traversal via unvalidated `userId` — files can be read/written outside baseDir |
| 3 | MEDIUM | `storage/src/local.ts`, `storage/src/s3.ts` | TOCTOU race in quota check — concurrent uploads can exceed quota |
| 4 | MEDIUM | `webhooks/src/outgoing.ts` | Unsafe type assertions allow silent auth bypass on corrupted config |
| 5 | MEDIUM | `webhooks/src/outgoing.ts` | No URL scheme/host validation — SSRF risk via internal/HTTP URLs |

**Total findings: 5** (2 HIGH, 3 MEDIUM, 0 CRITICAL)
