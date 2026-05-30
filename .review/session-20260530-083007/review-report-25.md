# Code Review Report — Cluster 25: AI Chat & AI Providers

**Reviewer**: Code Review Expert (Security Focus)
**Date**: 2026-05-30
**Files Reviewed**: 13 files across `ai-chat/` and `ai-provider/` routers

---

## Summary

Reviewed all 13 files in the AI chat and AI provider modules for security vulnerabilities, data integrity issues, API contract violations, and logic errors. Found **4 real issues**: 1 HIGH (defense-in-depth failure around encrypted API key access), and 3 MEDIUM (a config merge logic bug, a silent-failure API contract issue, and inconsistent error handling).

---

### [SEVERITY: HIGH] Finding 1: Provider query loads encrypted API key without userId scoping

**File**: `packages/api/src/routers/ai-chat/send-message.ts:19-23`
**Problem**: The query that resolves the AI provider fetches the full row — including the `encryptedApiKey` column — using only the user-supplied `providerId` without scoping by `userId`. The ownership check happens _after_ the data has already been loaded into Node.js process memory. This violates defense-in-depth: a user supplying an arbitrary provider ID causes the encrypted API key blob (ciphertext + IV + auth tag) for another user's provider to be materialized in application memory, even though the code throws before decrypting it.

**Evidence**:
```ts
// Line 19-23: selects ALL columns (including encryptedApiKey) without userId filter
const providerRows = await db
  .select()
  .from(aiProviders)
  .where(eq(aiProviders.id, input.providerId))
  .limit(1);

const providerRecord = providerRows[0];
// Line 26: ownership check happens AFTER encrypted key is already in memory
if (!providerRecord || providerRecord.userId !== userId) {
  throw new Error("AI provider not found or access denied");
}
```

Compare with `read.ts` which does this correctly — selecting only non-sensitive columns AND filtering by userId:
```ts
// read.ts:11-28 — safe pattern
.select({
  id: aiProviders.id,
  provider: aiProviders.provider,
  // ... no encryptedApiKey
})
.where(and(
  eq(aiProviders.id, input.id),
  eq(aiProviders.userId, ctx.user.id),
))
```

**Impact**: If a memory dump, logging incident, or debugging session captures the `providerRecord` variable, encrypted API key blobs belonging to other users would be exposed. While the key can't be decrypted without `ENCRYPTION_KEY`, exposing the ciphertext + IV + auth tag gives an attacker part of what they need (they'd only need the master encryption key). This is a credential material exposure risk.

**Suggestion**: Add `userId` to the WHERE clause so the database never returns rows the user doesn't own:
```ts
const providerRows = await db
  .select()
  .from(aiProviders)
  .where(
    and(
      eq(aiProviders.id, input.providerId),
      eq(aiProviders.userId, userId),
    )
  )
  .limit(1);

if (!providerRows[0]) {
  throw new TRPCError({ code: "NOT_FOUND", message: "AI provider not found" });
}
```

---

### [SEVERITY: MEDIUM] Finding 2: `config: null` silently ignored in provider update — users cannot clear config

**File**: `packages/api/src/routers/ai-provider/update.ts:44-45`
**Problem**: The update schema declares `config: z.record(z.string(), z.unknown()).nullable().optional()`, meaning `null` is a valid input representing "clear the config". However, when a user passes `config: null`, the code enters the merge block (because `null !== undefined`) but then calls `Object.assign(newConfig, null)` which is a no-op. The existing config is written back unchanged, silently swallowing the user's intent to clear it.

**Evidence**:
```ts
// Schema allows null: "clear my config"
// schemas.ts:19
config: z.record(z.string(), z.unknown()).nullable().optional(),

// update.ts:42-47 — null passes the !== undefined check but Object.assign ignores it
if (rest.config !== undefined) {
  // rest.config is null here — enters this block
  Object.assign(newConfig, rest.config);
  // Object.assign(target, null) → no-op. Config NOT cleared.
}
updates.config = newConfig;
```

**Impact**: Users who submit `config: null` to clear their provider configuration will receive a success response (`{ id }`) but the config remains unchanged. This is a data integrity bug — the API accepts the input but doesn't honor it.

**Suggestion**: Handle `null` explicitly to support clearing:
```ts
if (rest.config === null) {
  updates.config = {};
} else if (rest.config !== undefined) {
  Object.assign(newConfig, rest.config);
  updates.config = newConfig;
}
```

---

### [SEVERITY: MEDIUM] Finding 3: Update mutation returns `null` for not-found providers instead of throwing

**File**: `packages/api/src/routers/ai-provider/update.ts:21-23`
**Problem**: When the ownership/existence check fails, the mutation returns `null` instead of throwing an error. The tRPC client receives a successful HTTP 200 response with `null` data. The client has no way to distinguish between "update succeeded" and "provider doesn't exist or access denied." This violates the API contract — mutations that can't act on the target resource should signal failure.

**Evidence**:
```ts
// update.ts:16-23
const [existing] = await db
  .select({ id: aiProviders.id })
  .from(aiProviders)
  .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, ctx.user.id)));

if (!existing) {
  return null; // Mutation succeeds with null — client can't tell it failed
}
```

Compare with `delete.ts` which also uses `.returning()` but does correctly return `null` from the result (though `delete.ts` has the same issue — it returns `null` when nothing was deleted rather than throwing).

The `exchange/send-email.ts` pattern is the correct one:
```ts
// exchange/send-email.ts:35
throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" });
```

**Impact**: Frontend code that calls `update` and checks the response may interpret `null` as a successful update, leading to stale UI state where the user thinks their changes were saved when they weren't. The error is silently swallowed.

**Suggestion**: Throw a `TRPCError` for not-found resources:
```ts
if (!existing) {
  throw new TRPCError({ code: "NOT_FOUND", message: "AI provider not found" });
}
```

---

### [SEVERITY: MEDIUM] Finding 4: Plain `Error` thrown instead of `TRPCError` — client receives unhelpful generic errors

**File**: `packages/api/src/routers/ai-chat/send-message.ts:27-31`
**Problem**: The `send-message` procedure throws plain `Error` objects for business logic failures ("provider not found", "provider is disabled"). Without a custom `onError` formatter, tRPC wraps these as `INTERNAL_SERVER_ERROR` with a generic message — the original error text is not forwarded to the client. The user gets a useless "Internal server error" instead of knowing their provider is disabled or not found.

**Evidence**:
```ts
// send-message.ts:27-31
if (!providerRecord || providerRecord.userId !== userId) {
  throw new Error("AI provider not found or access denied");
}
if (!providerRecord.enabled) {
  throw new Error("AI provider is disabled");
}
```

No custom error formatter is configured (confirmed in `apps/web/src/routes/api/trpc/$.ts` and `packages/api/src/index.ts`). By contrast, `exchange/send-email.ts` correctly uses `TRPCError`:
```ts
throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" });
```

**Impact**: Users see generic "Internal server error" messages and cannot take corrective action (e.g., re-enabling their provider or selecting a valid one). This creates a poor UX and unnecessary support burden.

**Suggestion**: Use `TRPCError` with appropriate error codes:
```ts
import { TRPCError } from "@trpc/server";

if (!providerRecord || providerRecord.userId !== userId) {
  throw new TRPCError({ code: "NOT_FOUND", message: "AI provider not found" });
}
if (!providerRecord.enabled) {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI provider is disabled" });
}
```

> **Note**: This pattern (`throw new Error`) also appears in `webhook/update.ts`, `hook/accept-insight.ts`, `hook/update.ts`, and others — it's a codebase-wide inconsistency that should be addressed holistically. Flagging it here because it directly impacts the user-facing AI chat feature.

---

## Items Explicitly NOT Flagged

The following were considered and determined to be **non-issues**:

- **`data-access.ts` `_userId` parameter**: The unused `_userId` in `createMessageStore` is intentional — scoping is handled at call sites by `chat.ts` which receives `input.userId` from the authenticated tRPC context.
- **`list-messages.ts` `select()` with no column filter**: All `aiChatMessages` columns are user-owned data and the query is properly scoped by `userId`.
- **SQL injection via `searchClients` pattern**: Uses Drizzle's `ilike()` which is parameterized. The `%` wildcard in user input is a feature, not a vulnerability (it's user's own data).
- **No rate limiting on `sendMessage`**: Valid concern but architectural, not a code bug in these files.
- **`chat.ts` history includes just-persisted message**: This is correct — the AI should see the current user message in context.
- **API key encryption implementation (`@DCRM/crypto`)**: Uses AES-256-GCM with proper IV, auth tag, and SHA-256 key derivation. Solid implementation.
