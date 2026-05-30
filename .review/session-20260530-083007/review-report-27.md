# Code Review Report — Cluster 27: Webhook (Outgoing) Router

**Reviewer**: Automated Deep Review
**Date**: 2026-05-30
**Files Reviewed**: 8 files in `packages/api/src/routers/webhook/`
**Focus**: Security — SSRF prevention, auth credential encryption, userId scoping, data flow

---

### [SEVERITY: CRITICAL] Finding 1: No URL Validation — SSRF Vulnerability

**File**: `packages/api/src/routers/webhook/schemas.ts:8`
**Problem**: The `url` field in both `createOutgoingWebhookSchema` and `updateOutgoingWebhookSchema` uses only `z.string().min(1).max(2048)` with zero URL format or scheme validation and zero SSRF protection. Since outgoing webhooks make HTTP requests to stored URLs when events fire, an attacker can target internal infrastructure.

**Evidence**:
```ts
// schemas.ts:8 (create)
url: z.string().min(1).max(2048),
// schemas.ts:49 (update)
url: z.string().min(1).max(2048).optional(),
```

No `z.string().url()` format check. No blocklist for private/internal IPs. No scheme restriction to `https://`.

**Impact**: A user can set a webhook URL to:
- `http://169.254.169.254/latest/meta-data/` — AWS/GCP metadata service (credential exfiltration)
- `http://localhost:<port>` — reach internal services on the server
- `http://10.0.0.0/8`, `http://192.168.0.0/16`, `http://172.16.0.0/12` — private network scanning
- `file:///etc/passwd` — potential local file access depending on HTTP client
- Any arbitrary non-URL string that causes errors at delivery time

This is a textbook SSRF vector. When the webhook delivery engine fires, it will make an HTTP request to whatever URL is stored.

**Suggestion**: Add URL validation at the schema level with SSRF-aware checks:

```ts
import { z } from "zod";

const webhookUrlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol)) return false;
      // Block common SSRF targets — the delivery engine should also
      // enforce this at request time as defense-in-depth
      const hostname = parsed.hostname.toLowerCase();
      const blocked = [
        "localhost", "127.0.0.1", "0.0.0.0", "::1",
        "169.254.169.254", // cloud metadata
        "metadata.google.internal",
      ];
      if (blocked.includes(hostname)) return false;
      // Block private IP ranges
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return false;
      return true;
    } catch {
      return false;
    }
  },
  { message: "URL must be a valid HTTP(S) URL and not target internal addresses" },
);
```

Replace `z.string().min(1).max(2048)` with `webhookUrlSchema` in both create and update schemas. Additionally, the webhook delivery engine should perform DNS-resolution-time checks (to catch DNS rebinding) as defense-in-depth.

---

### [SEVERITY: HIGH] Finding 2: Missing `type` Filter in Update Allows Mutating Non-Webhook Hooks

**File**: `packages/api/src/routers/webhook/update.ts:15-27`
**Problem**: The update procedure queries the `hooks` table by `id` + `userId` but never checks that the record's `type` is `outgoing_webhook`. The `hooks` table stores three hook types: `ai`, `outgoing_webhook`, and `built_in` (confirmed in `packages/domain/src/hook.ts`). This means the webhook API can overwrite the `config` JSON blob of `ai` or `built_in` hooks owned by the same user.

**Evidence**:
```ts
// update.ts:15-27
const [existing] = await db
  .select({ config: hooks.config })
  .from(hooks)
  .where(
    and(
      eq(hooks.id, id),
      eq(hooks.userId, ctx.user.id),
      // Missing: eq(hooks.type, "outgoing_webhook")
    ),
  );

if (!existing) {
  throw new Error("Webhook not found");
}
// Proceeds to overwrite config...
```

The `list` procedure correctly filters by type (`row.type === "outgoing_webhook"`), and the `create` procedure only creates `outgoing_webhook` type records. But `update` has no type guard.

**Impact**: A user (or compromised client) can corrupt `ai` or `built_in` hook configurations by passing their IDs through the webhook update endpoint. The update overwrites the entire `config` JSON with webhook-specific fields (`url`, `auth`, `method`, `headers`, `timeoutMs`, `maxRetries`), destroying the original hook's config. This is both a data integrity violation and an API contract violation.

**Suggestion**: Add a type check to the WHERE clause:

```ts
const [existing] = await db
  .select({ config: hooks.config, type: hooks.type })
  .from(hooks)
  .where(
    and(
      eq(hooks.id, id),
      eq(hooks.userId, ctx.user.id),
      eq(hooks.type, "outgoing_webhook"),
    ),
  );
```

---

### [SEVERITY: HIGH] Finding 3: Missing `type` Filter in Delete Allows Deleting Non-Webhook Hooks

**File**: `packages/api/src/routers/webhook/delete.ts:11-18`
**Problem**: Same class of issue as Finding 2. The delete procedure filters only by `id` + `userId`, not by `type`. A user can delete any hook they own — including `ai` and `built_in` hooks — through the webhook API.

**Evidence**:
```ts
// delete.ts:11-18
await db
  .delete(hooks)
  .where(
    and(
      eq(hooks.id, input.id),
      eq(hooks.userId, ctx.user.id),
      // Missing: eq(hooks.type, "outgoing_webhook")
    ),
  );
```

**Impact**: Any hook (AI automation, built-in hook) owned by the user can be silently deleted through the webhook delete endpoint. This bypasses whatever guard rails or business logic exist in the respective hook-type routers.

**Suggestion**: Add the type filter:

```ts
.where(
  and(
    eq(hooks.id, input.id),
    eq(hooks.userId, ctx.user.id),
    eq(hooks.type, "outgoing_webhook"),
  ),
)
```

---

### [SEVERITY: MEDIUM] Finding 4: `auth-builder.ts` Bypasses Centralized Env Validation

**File**: `packages/api/src/routers/webhook/auth-builder.ts:24-26`
**Problem**: `buildEncryptedAuth` reads `ENCRYPTION_KEY` directly from `process.env` with inline validation, bypassing the centralized `@DCRM/env/server` package. Every other consumer in the codebase (11 files across `ai-provider`, `ai-chat`, `email-account`, `exchange`, `billing`, `auth`, `db`) imports `env.ENCRYPTION_KEY` from `@DCRM/env/server`.

**Evidence**:
```ts
// auth-builder.ts:24-26 — direct process.env access
const key = process.env["ENCRYPTION_KEY"];
if (!key || key.length < 32) {
  throw new Error("ENCRYPTION_KEY environment variable must be at least 32 characters");
}
```

Compare with the standard pattern used everywhere else:
```ts
// ai-provider/create.ts:13
import { env } from "@DCRM/env/server";
const crypto = createCrypto(env.ENCRYPTION_KEY);
```

**Impact**:
1. **Inconsistency**: This is the ONLY file that reads encryption config from `process.env` directly.
2. **Redundant validation**: The env package already validates `ENCRYPTION_KEY: z.string().min(32)` at startup. The inline check in auth-builder duplicates this.
3. **Subtle behavior difference**: If the env package validation is updated (e.g., requiring a specific key format), this file won't benefit from the change since it bypasses the package entirely.
4. **Missing key fails late**: While the env package fails at startup, `auth-builder.ts` fails only when a webhook with auth is created — a runtime surprise.

**Suggestion**: Use the centralized env import like all other files:

```ts
import { env } from "@DCRM/env/server";
import { createCrypto } from "@DCRM/crypto";

export function buildEncryptedAuth(raw: RawAuthInput): OutgoingWebhookAuthConfig | NoneAuthConfig {
  const crypto = createCrypto(env.ENCRYPTION_KEY);
  // ... switch statement unchanged
}
```

Remove the inline validation — the env package guarantees the key is present and >= 32 chars.

---

### [SEVERITY: MEDIUM] Finding 5: `update.ts` Returns HTTP 500 for "Not Found" Instead of HTTP 404

**File**: `packages/api/src/routers/webhook/update.ts:26`
**Problem**: When a webhook is not found, the code throws a raw `Error("Webhook not found")`. tRPC converts unhandled `Error` instances into `INTERNAL_SERVER_ERROR` (HTTP 500), which is semantically incorrect for a resource-not-found condition. Clients (and monitoring systems) cannot distinguish between "the webhook doesn't exist" (client error) and "the server crashed" (server error).

**Evidence**:
```ts
// update.ts:26
throw new Error("Webhook not found");
```

Compare with `exchange/send-email.ts` which correctly uses:
```ts
throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" });
```

**Impact**: Clients receive a 500 status code and a generic error message when they attempt to update a non-existent webhook. This breaks API contract expectations, makes client-side error handling harder, and pollutes server error monitoring with false-positive 500 alerts.

**Suggestion**: Use `TRPCError` with the correct code:

```ts
import { TRPCError } from "@trpc/server";

// ...
if (!existing) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
}
```

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | CRITICAL | schemas.ts | No URL validation / SSRF prevention on webhook `url` field |
| 2 | HIGH | update.ts | Missing `type` filter — can mutate non-webhook hooks |
| 3 | HIGH | delete.ts | Missing `type` filter — can delete non-webhook hooks |
| 4 | MEDIUM | auth-builder.ts | Bypasses centralized env validation, reads `process.env` directly |
| 5 | MEDIUM | update.ts | Raw `Error` instead of `TRPCError` returns HTTP 500 for "not found" |

**What's done well**:
- `userId` scoping is consistently applied across all CRUD operations (every query includes `eq(hooks.userId, ctx.user.id)`)
- Auth credentials are encrypted before storage via `buildEncryptedAuth` — plaintext never touches the DB
- The read endpoint strips encrypted auth data from the response, only returning the `authMode` string
- Exhaustiveness check (`const _: never = raw`) in auth-builder's switch statement
- The `list` endpoint correctly filters by `type === "outgoing_webhook"` at the application level
