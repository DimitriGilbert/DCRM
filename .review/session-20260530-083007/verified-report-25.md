# Verified Report — Cluster 25: AI Chat & AI Providers

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-25.md

---

## Verification Summary

| # | Original Severity | Finding | Verdict |
|---|-------------------|---------|---------|
| 1 | HIGH | Provider query loads encrypted key without userId scoping | ✅ **CONFIRMED** (severity adjusted) |
| 2 | MEDIUM | `config: null` silently ignored in provider update | ✅ **CONFIRMED** |
| 3 | MEDIUM | Update returns `null` for not-found instead of throwing | ✅ **CONFIRMED** (design issue) |
| 4 | MEDIUM | Plain `Error` instead of `TRPCError` | ✅ **CONFIRMED** |

---

### [SEVERITY: HIGH → MEDIUM] Finding 1: Provider query loads encrypted key without userId scoping — ✅ CONFIRMED (severity adjusted)

**File**: `packages/api/src/routers/ai-chat/send-message.ts:19-23`

**Evidence Verified**:

1. **Lines 19-23**: `db.select().from(aiProviders).where(eq(aiProviders.id, input.providerId))` — selects ALL columns (including `encryptedApiKey`) without a `userId` filter.
2. **Line 26**: Ownership check `providerRecord.userId !== userId` happens AFTER the data is already in process memory.
3. **DB Schema** (automation.ts:199-222): `aiProviders` table includes `encryptedApiKey: text("encrypted_api_key").notNull()`.
4. **Compare with read.ts** (lines 11-28): Correctly uses a `select()` that excludes `encryptedApiKey` AND filters by `eq(aiProviders.userId, ctx.user.id)`.

**Severity Adjustment**: The original report rates this as HIGH for a multi-tenant system. However, per AGENTS.md, DCRM is a **single-user CRM** ("Single-user only — no teams, no orgs, no collaboration"). In a single-user deployment, there is only one user, so no cross-user credential exposure is possible. Downgrading to **MEDIUM** as a defense-in-depth best-practice issue rather than an exploitable vulnerability.

**Verdict**: CONFIRMED. The pattern is technically inferior to the `read.ts` approach, and if the app were ever multi-user it would be HIGH. But for a single-user CRM, the practical risk is minimal.

---

### [SEVERITY: MEDIUM] Finding 2: `config: null` silently ignored — ✅ CONFIRMED

**File**: `packages/api/src/routers/ai-provider/update.ts:33-47`

**Evidence Verified**:

1. **Schema** (schemas.ts:19): `config: z.record(z.string(), z.unknown()).nullable().optional()` — `null` is a valid input.
2. **update.ts:33**: `if (rest.defaultModel !== undefined || rest.config !== undefined)` — `null !== undefined`, so the block is entered when `config: null` is passed.
3. **update.ts:44**: `if (rest.config !== undefined)` — `null !== undefined`, so this inner block is also entered.
4. **update.ts:45**: `Object.assign(newConfig, rest.config)` — `Object.assign(target, null)` is a no-op per the JavaScript spec. The existing config remains unchanged.
5. **update.ts:47**: `updates.config = newConfig` — the unchanged config is written back.

The user's intent to clear the config is silently swallowed. The API returns `{ id }` implying success.

**Verdict**: CONFIRMED. The API accepts `config: null` but doesn't honor it. The merge logic should handle `null` explicitly (e.g., set config to `{}`).

---

### [SEVERITY: MEDIUM] Finding 3: Update returns `null` for not-found providers — ✅ CONFIRMED

**File**: `packages/api/src/routers/ai-provider/update.ts:21-23`

**Evidence Verified**:

1. **Lines 21-23**: `if (!existing) { return null; }` — returns `null` when the provider doesn't exist or the user doesn't own it.
2. The tRPC client receives HTTP 200 with `null` data — indistinguishable from a successful update that returns no data.

**Context**: This is a design pattern question rather than a bug. The codebase is inconsistent:
- `exchange/send-email.ts:35`: `throw new TRPCError({ code: "NOT_FOUND", ... })` — throws
- `ai-provider/update.ts:22`: `return null` — silent
- `email-account/update.ts:28`: `return null` — silent
- `entity-tag/attach.ts:24`: `return null` — silent

**Verdict**: CONFIRMED as a design inconsistency. Returning `null` for not-found resources is used in several places, making it a codebase-wide pattern rather than an isolated bug. However, throwing a `TRPCError` would provide better API semantics and client-side error handling.

---

### [SEVERITY: MEDIUM] Finding 4: Plain `Error` thrown instead of `TRPCError` — ✅ CONFIRMED

**File**: `packages/api/src/routers/ai-chat/send-message.ts:27-31`

**Evidence Verified**:

1. **Line 27**: `throw new Error("AI provider not found or access denied")` — plain `Error`.
2. **Line 30**: `throw new Error("AI provider is disabled")` — plain `Error`.
3. **No custom error formatter** (confirmed in `packages/api/src/index.ts:5`): `initTRPC.context<Context>().create()` — no `.formatError()` or `.onError()`.
4. Without a custom formatter, tRPC wraps plain `Error` as `INTERNAL_SERVER_ERROR` with a generic message. The specific error text ("provider is disabled", "not found") is not forwarded to the client.

**Compare** with the correct pattern in `exchange/send-email.ts`:
- `throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" })` — specific error code and message reach the client.

**Verdict**: CONFIRMED. Users see generic "Internal server error" instead of actionable messages like "AI provider is disabled" or "AI provider not found". The suggestion to use `TRPCError` with appropriate codes is correct. The report notes this pattern appears in other files (`webhook/update.ts`, `hook/accept-insight.ts`, `hook/update.ts`), which is consistent with the codebase-wide inconsistency noted in Finding 3.

---

## Items Verified as NOT Flagged (Correct Non-Issues)

- **`data-access.ts` `_userId` parameter**: Intentional — scoping handled at call sites.
- **`list-messages.ts` `select()` with no column filter**: All columns are user-owned data, properly scoped by `userId`.
- **No rate limiting on `sendMessage`**: Architectural concern, not a code bug in these files.
- **API key encryption (`@DCRM/crypto`)**: Uses AES-256-GCM with proper IV and auth tag.

---

## Overall Assessment

All 4 findings are confirmed. Finding 1 is technically valid but severity is adjusted from HIGH to MEDIUM due to the single-user nature of the application. Findings 3 and 4 both point to codebase-wide inconsistencies in error handling patterns that should ideally be addressed holistically.
