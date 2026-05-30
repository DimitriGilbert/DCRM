# Verified Report — Cluster 23: Notifications, Settings & Billing

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-23.md

---

## Verification Summary

| # | Original Severity | Finding | Verdict |
|---|-------------------|---------|---------|
| 1 | CRITICAL | `unreadOnly` filter broken — `isNull` on NOT NULL column | ✅ **CONFIRMED** |
| 2 | HIGH | `getSubscriptionStatus` missing `BILLING_ENABLED` guard | ✅ **CONFIRMED** |
| 3 | HIGH | Race condition in settings SELECT-then-INSERT | ✅ **CONFIRMED** |
| 4 | MEDIUM | `completeOnboarding` no guard against re-completion | ✅ **CONFIRMED** |

---

### [SEVERITY: CRITICAL] Finding 1: `unreadOnly` filter is broken — ✅ CONFIRMED

**File**: `packages/api/src/routers/notification/list.ts:14`

**Evidence Verified**:

1. **list.ts:14**: `conditions.push(isNull(notifications.read))` — uses `isNull()` to filter for "unread" notifications.
2. **DB Schema** (automation.ts:403): `read: boolean("read").notNull().default(false)` — the column is defined as `.notNull()`. It can hold `true` or `false`, but never `NULL`.
3. `isNull()` on a NOT NULL column produces a condition that is **always false**. The `WHERE` clause becomes `userId = X AND FALSE`, returning zero rows.

**Verdict**: CONFIRMED. The `unreadOnly: true` feature is completely non-functional. Every call returns an empty list. The fix is trivial: replace `isNull(notifications.read)` with `eq(notifications.read, false)`.

---

### [SEVERITY: HIGH] Finding 2: `getSubscriptionStatus` missing `BILLING_ENABLED` guard — ✅ CONFIRMED

**File**: `packages/api/src/routers/billing/index.ts:32-39`

**Evidence Verified**:

1. **Lines 32-39** (`getSubscriptionStatus`): No `BILLING_ENABLED` check. Directly does `await import("@DCRM/billing")`.
2. **Lines 17-19** (`createCheckout`): `if (!env.BILLING_ENABLED) { throw new Error(...) }` — proper guard present.
3. **Lines 48-50** (`createPortalSession`): Same proper guard present.
4. **Lines 86-88** (`handleWebhook`): Returns `{ received: true }` when billing is disabled — proper handling.

`getSubscriptionStatus` is the only billing procedure that skips the guard. When `BILLING_ENABLED=false` (the default), the dynamic `import("@DCRM/billing")` may fail at runtime if the billing package isn't properly configured.

**Verdict**: CONFIRMED. Inconsistency in billing guard coverage. `getSubscriptionStatus` will crash or return misleading data when billing is disabled.

---

### [SEVERITY: HIGH] Finding 3: Race condition in settings upsert — ✅ CONFIRMED

**Files**:
- `packages/api/src/routers/settings/update-theme.ts:11-33`
- `packages/api/src/routers/settings/update-locale.ts:11-33`
- `packages/api/src/routers/settings/complete-onboarding.ts:11-39`

**Evidence Verified** (identical pattern in all three files):

1. **Step 1** (e.g., update-theme.ts:11-15): SELECT to check if a `userSettings` row exists.
2. **Step 2** (e.g., update-theme.ts:26-32): If not found, INSERT a new row with `userId` as primary key.
3. **DB Schema** (crm.ts — `userSettings` table): `userId` is `text("user_id").primaryKey()`. Duplicate primary key = hard error.

**Race scenario**: Two concurrent requests (e.g., browser prefetch, double-click):
- Request A: SELECT → no row found
- Request B: SELECT → no row found
- Request A: INSERT with `userId` → succeeds
- Request B: INSERT with same `userId` → **primary key violation** → unhandled 500

No `onConflictDoUpdate` is used anywhere in the codebase (confirmed by the `.set()` calls all using simple objects).

**Verdict**: CONFIRMED. The SELECT-then-INSERT pattern is vulnerable to primary key constraint violations under concurrent access. The fix is to use Drizzle's `onConflictDoUpdate` for atomic upserts.

---

### [SEVERITY: MEDIUM] Finding 4: `completeOnboarding` has no guard against re-completion — ✅ CONFIRMED

**File**: `packages/api/src/routers/settings/complete-onboarding.ts:17-28`

**Evidence Verified**:

1. **Lines 11-15**: SELECT checks if a row exists, but only fetches `{ userId }` — doesn't read the current `onboardingCompleted` value.
2. **Lines 17-27**: If existing row found, UPDATEs `onboardingCompleted: true` without checking if it's already `true`. Also overwrites `locale` and `theme` from input.

**Verdict**: CONFIRMED. Onboarding can be re-completed, silently overwriting theme/locale preferences. In a single-user CRM this is low risk (the user would be overwriting their own data), but it violates the expected one-time state transition. The severity is appropriately MEDIUM.

---

## Overall Assessment

All 4 findings are confirmed. The most impactful is Finding 1 — the unread notification filter is completely broken and always returns empty results. Finding 3 is a real race condition that can manifest during concurrent page loads or prefetch scenarios.
