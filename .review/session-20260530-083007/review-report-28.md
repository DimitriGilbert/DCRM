# Code Review Report — Cluster 28: Incoming Webhooks

**Reviewer**: Code Review Expert (Security-focused)
**Date**: 2026-05-30
**Scope**: `packages/api/src/routers/incoming-webhook/*` + `packages/webhooks/src/incoming.ts` + route handler
**Focus**: Security, signature validation, payload injection, rate limiting, receiver token handling, data flow correctness

---

## Summary

Reviewed 9 files covering incoming webhook CRUD, the public-facing webhook receiver endpoint, and the mapping test utility. The receiver delegates to `@DCRM/webhooks` for HMAC verification (timing-safe), JSON parsing, and field mapping — that core logic is sound. However, I found **4 real issues**: one data integrity bug, one type-safety bypass that silently accepts arbitrary DB update keys, one API contract violation that hides useful error semantics from clients, and one audit trail corruption issue in the live event pipeline.

---

### [SEVERITY: HIGH] Finding 1: `hasSecret` always hardcoded to `false` — never reflects actual state

**File**: `packages/api/src/routers/incoming-webhook/read.ts:36` and `packages/api/src/routers/incoming-webhook/list.ts:26`

**Problem**: The `hasSecret` field is intended to indicate whether a webhook has a secret configured for signature verification, but it is **always hardcoded to `false`** regardless of the actual database state. The `select()` queries in both files deliberately omit the `secret` column, so there's no data available to compute the correct value. The user has no way to know whether their webhook endpoint is secured with HMAC verification or relies solely on the URL token.

**Evidence**:
```ts
// read.ts — select does NOT include `secret` column
const [row] = await db
  .select({
    id: incomingWebhooks.id,
    name: incomingWebhooks.name,
    // ... no `secret` field selected
  })
  .from(incomingWebhooks)
  .where(...);

// Then:
return {
  ...row,
  hasSecret: false, // ← ALWAYS false, regardless of DB state
};
```

```ts
// list.ts — same pattern
return rows.map((row) => ({
  ...row,
  hasSecret: false, // ← ALWAYS false
}));
```

**Impact**: The UI cannot distinguish between a webhook secured with an HMAC secret and one protected only by URL token obscurity. A user who believes they set a secret has no confirmation it was stored. This is a data integrity / correctness bug.

**Suggestion**: Select the `secret` column (or a derived boolean) and set `hasSecret` based on its actual value:

```ts
// In the select:
secret: incomingWebhooks.secret,

// In the return:
hasSecret: row.secret !== null && row.secret.length > 0,
```

---

### [SEVERITY: HIGH] Finding 2: Untyped `Record<string, unknown>` bypasses Drizzle type safety in update

**File**: `packages/api/src/routers/incoming-webhook/update.ts:28-36`

**Problem**: The update values are accumulated in a `Record<string, unknown>` and passed directly to Drizzle's `.set()`. This bypasses Drizzle's compile-time type checking, meaning any arbitrary key (including typos or non-existent columns) would be silently accepted and sent to the database — potentially causing a runtime error or, worse, silently writing invalid data.

**Evidence**:
```ts
const setValues: Record<string, unknown> = {  // ← no column-level type safety
  updatedAt: new Date(),
};

if (updates.name !== undefined) setValues.name = updates.name;
if (updates.secret !== undefined) setValues.secret = updates.secret;
if (updates.mode !== undefined) setValues.mode = updates.mode;
if (updates.mappingConfig !== undefined) setValues.mappingConfig = updates.mappingConfig;
if (updates.enabled !== undefined) setValues.enabled = updates.enabled;

await db
  .update(incomingWebhooks)
  .set(setValues)  // ← accepts any key, no compile-time check
  .where(...);
```

**Impact**: A typo like `setValues.nme = updates.name` or an added field like `setValues.adminFlag = true` would compile without error and be silently sent to the database. This undermines the entire purpose of using a typed ORM.

**Suggestion**: Build a properly typed partial object using the Drizzle table columns, or construct the values inline:

```ts
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

type WebhookUpdate = Partial<typeof incomingWebhooks.$inferInsert>;

const setValues: WebhookUpdate = {
  updatedAt: new Date(),
};

if (updates.name !== undefined) setValues.name = updates.name;
if (updates.secret !== undefined) setValues.secret = updates.secret;
// ... etc
```

---

### [SEVERITY: MEDIUM] Finding 3: Raw `Error` thrown instead of `TRPCError` — wrong HTTP status returned to clients

**File**: `packages/api/src/routers/incoming-webhook/update.ts:25` and `packages/api/src/routers/incoming-webhook/test-mapping.ts:27`

**Problem**: When a webhook is not found (ownership check fails), these procedures throw a raw `new Error(...)`. tRPC catches raw errors and returns `INTERNAL_SERVER_ERROR` (HTTP 500) to the client. The correct behavior — already used elsewhere in this codebase (e.g., `exchange/send-email.ts`) — is to throw `TRPCError` with an appropriate code like `NOT_FOUND` (HTTP 404). This means clients receive a 500 error for what is actually a 404 scenario, making it impossible to handle gracefully.

**Evidence**:
```ts
// update.ts:24-26
if (!existing) {
  throw new Error("Incoming webhook not found");  // → client gets 500
}

// test-mapping.ts:26-28
if (!row) {
  throw new Error("Incoming webhook not found");  // → client gets 500
}
```

Compare with the correct pattern already in the codebase:
```ts
// exchange/send-email.ts:35
throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" });  // → client gets 404
```

**Impact**: Clients cannot distinguish between "resource not found" (user error) and "server internal error" (bug). This breaks error handling in the UI and makes debugging harder. Could also mask actual server errors since all failures look the same.

**Suggestion**:
```ts
import { TRPCError } from "@trpc/server";

if (!existing) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Incoming webhook not found" });
}
```

---

### [SEVERITY: MEDIUM] Finding 4: `lastReceivedAt` updated before mode/validation checks — corrupts audit trail

**File**: `packages/webhooks/src/incoming.ts:211` (consumed by `receiver.ts`)

**Problem**: In `handleIncomingWebhook`, the `updateLastReceived` call happens at line 211 — **after** authentication and mapping config validation succeed, but **before** the test-vs-live mode branch and **before** the mapping result validation in live mode. This means:
1. **Test mode** requests update the timestamp even though no event is actually emitted (the webhook wasn't "received" in a production sense).
2. **Live mode with mapping failures**: If the mapping produces errors (line 233), the event is NOT emitted, but `lastReceivedAt` was already updated — falsely indicating a successful receipt.

**Evidence**:
```ts
// Line 211 — runs unconditionally after auth + config validation
await deps.updateLastReceived(webhook.id);

// Line 214 — test mode: no event emitted, but timestamp was already updated
if (webhook.mode === "test") {
  return { ... preview only ... };
}

// Line 233 — live mode: mapping failed, event NOT emitted, but timestamp was already updated
if (!mappingResult.success) {
  return { accepted: false, ... };
}
```

**Impact**: The `lastReceivedAt` field becomes unreliable as an indicator of when the last successful event was processed. Users or monitoring systems relying on this timestamp for "last successful webhook" tracking will see incorrect data.

**Suggestion**: Move `updateLastReceived` to run only when the webhook is actually processed successfully:
- For **test mode**: Either don't update, or use a separate `lastTestedAt` field.
- For **live mode**: Only update after the event is successfully emitted (after line 258).

```ts
// Move to after successful processing:
if (webhook.mode === "test") {
  // Don't update lastReceivedAt for test requests
  return { ... };
}

// Live mode with mapping errors — don't update
if (!mappingResult.success) {
  return { ... };
}

// Live mode success — NOW update
const event = await emitEvent(deps.persister, eventInput);
await deps.updateLastReceived(webhook.id);
```

---

## Non-issues confirmed safe

- **HMAC signature verification** (`incoming.ts:80-113`): Uses `timingSafeEqual` correctly. Length check before comparison prevents length-leak edge cases. Sound implementation.
- **JSON parsing** (`incoming.ts:170-187`): Properly validates that parsed result is a plain object (not array, not null). Safe.
- **SQL injection**: All queries use Drizzle ORM parameterized queries. No injection vectors.
- **Prototype pollution via `targetField`**: `result[field.targetField] = value` on a `{}` literal is safe in modern engines — `__proto__` is treated as a regular property.
- **Ownership scoping**: All CRUD operations correctly filter by `userId` in WHERE clauses. No horizontal privilege escalation.
- **URL token exposure**: Returning `urlToken` in read/list is intentional — users need it to configure external services.
- **Secret stored as plaintext**: While outgoing webhooks use `@DCRM/crypto` encryption, the incoming webhook secret must be available in plaintext for HMAC comparison on every request. This is a standard pattern (same as GitHub webhooks).
- **`receiver.ts` not in tRPC router**: Correct — it's imported directly by the API route handler as a raw HTTP endpoint. Not missing from the router.

---

*End of report. 4 findings total: 2 HIGH, 2 MEDIUM.*
