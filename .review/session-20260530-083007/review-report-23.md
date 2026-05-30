# Code Review Report — Cluster 23: Notifications, Settings & Billing

**Reviewer**: Code Review Expert (automated)
**Date**: 2026-05-30
**Scope**: `packages/api/src/routers/{notification,settings,billing}`

---

### [SEVERITY: CRITICAL] Finding 1: `unreadOnly` filter is broken — uses `isNull` on a NOT NULL column

**File**: `packages/api/src/routers/notification/list.ts:14`
**Problem**: The `unreadOnly` feature returns zero results every time. The `notifications.read` column is defined as `boolean("read").notNull().default(false)` — it can never be NULL. Using `isNull(notifications.read)` produces a condition that is always false, so the AND-conjunction matches nothing.

**Evidence**:
```ts
// list.ts:14
if (input.unreadOnly) {
  conditions.push(isNull(notifications.read));
}
```
```ts
// schema definition (automation.ts:403)
read: boolean("read").notNull().default(false),
```

**Impact**: Any client requesting `unreadOnly: true` will receive an empty list — the entire "show unread notifications" feature is non-functional. This is a user-facing feature break.

**Suggestion**: Replace `isNull(notifications.read)` with `eq(notifications.read, false)`:
```ts
import { eq, and, desc, lt } from "drizzle-orm";
// ...
if (input.unreadOnly) {
  conditions.push(eq(notifications.read, false));
}
```

---

### [SEVERITY: HIGH] Finding 2: `getSubscriptionStatus` has no `BILLING_ENABLED` guard — will crash when billing is disabled

**File**: `packages/api/src/routers/billing/index.ts:32-39`
**Problem**: `createCheckout` (line 17) and `createPortalSession` (line 48) both check `env.BILLING_ENABLED` and throw a clear error when billing is disabled. `getSubscriptionStatus` does NOT check this flag. When `BILLING_ENABLED` is `false` (the default), the dynamic `import("@DCRM/billing")` may fail at runtime if the billing package isn't configured, or worse, return stale/incorrect data from the database without Stripe validation.

**Evidence**:
```ts
// Lines 32-39 — no BILLING_ENABLED check
export const getSubscriptionStatus = protectedProcedure.query(
  async ({ ctx }) => {
    const { createSubscriptionService } = await import("@DCRM/billing");
    const subscriptionService = createSubscriptionService();
    return subscriptionService.getStatus(ctx.user.id);
  },
);
```

Compare with the guard in `createCheckout`:
```ts
// Lines 17-19 — proper guard
if (!env.BILLING_ENABLED) {
  throw new Error("Billing is not enabled in this environment");
}
```

**Impact**: In the default configuration (`BILLING_ENABLED=false`), calling `getSubscriptionStatus` either crashes with an unhelpful dynamic-import error or returns misleading data. All three user-facing billing procedures should be consistently gated.

**Suggestion**: Add the same guard:
```ts
export const getSubscriptionStatus = protectedProcedure.query(
  async ({ ctx }) => {
    if (!env.BILLING_ENABLED) {
      return { status: "inactive" }; // or throw like the others
    }
    const { createSubscriptionService } = await import("@DCRM/billing");
    const subscriptionService = createSubscriptionService();
    return subscriptionService.getStatus(ctx.user.id);
  },
);
```

---

### [SEVERITY: HIGH] Finding 3: Race condition in settings upsert — SELECT then INSERT can violate primary key

**File**: `packages/api/src/routers/settings/update-theme.ts:11-33`, `update-locale.ts:11-33`, `complete-onboarding.ts:11-39`
**Problem**: All three settings mutations use a SELECT-then-INSERT-or-UPDATE pattern. Between the SELECT and the INSERT, a concurrent request (e.g., two tabs, prefetch race) could insert a `userSettings` row with the same `userId` (which is the primary key), causing a database unique constraint violation error that surfaces as an unhandled 500.

The `userSettings` table uses `userId` as its primary key (`text("user_id").primaryKey()`), so a duplicate insert will fail hard.

**Evidence** (same pattern in all three files):
```ts
// update-theme.ts:11-33
const [existing] = await db
  .select({ userId: userSettings.userId })
  .from(userSettings)
  .where(eq(userSettings.userId, ctx.user.id))
  .limit(1);

if (existing) {
  // UPDATE path
} else {
  // INSERT path — races with another concurrent request
  const [created] = await db
    .insert(userSettings)
    .values({ userId: ctx.user.id, theme: input.theme })
    .returning();
  return created;
}
```

**Impact**: Under concurrent requests (parallel prefetch, rapid double-click, multiple tabs), the INSERT path throws a primary key constraint violation. This is an unhandled error — the user sees a 500. The codebase already uses no `onConflictDoUpdate` anywhere (confirmed via search), so this pattern is consistently fragile across the settings module.

**Suggestion**: Use Drizzle's `onConflictDoUpdate` for an atomic upsert:
```ts
const [upserted] = await db
  .insert(userSettings)
  .values({ userId: ctx.user.id, theme: input.theme })
  .onConflictDoUpdate({
    target: userSettings.userId,
    set: { theme: input.theme, updatedAt: new Date() },
  })
  .returning();
return upserted;
```

This eliminates the race condition entirely and is a single DB round-trip instead of two.

---

### [SEVERITY: MEDIUM] Finding 4: `completeOnboarding` has no guard against already-completed onboarding — violates state machine

**File**: `packages/api/src/routers/settings/complete-onboarding.ts:8-39`
**Problem**: The onboarding state machine has an implicit `incomplete → complete` transition, but there is no guard preventing re-invocation. If `onboardingCompleted` is already `true`, calling this mutation silently overwrites locale/theme values and sets `onboardingCompleted: true` again. This breaks the state machine invariant — onboarding is a one-time transition.

**Evidence**:
```ts
// complete-onboarding.ts — no check of current onboardingCompleted value
export const completeOnboarding = protectedProcedure
  .input(completeOnboardingSchema)
  .mutation(async ({ ctx, input }) => {
    // ... SELECT existing ...
    if (existing) {
      // UPDATEs without checking if onboardingCompleted is already true
      const [updated] = await db
        .update(userSettings)
        .set({
          onboardingCompleted: true,
          // ...
        })
```

**Impact**: A user who has already completed onboarding can have their theme/locale silently overwritten by calling this endpoint again (e.g., stale client state, replayed request). While not a security issue, it violates the expected one-time nature of onboarding completion and could cause confusing UX.

**Suggestion**: Check the current state before updating:
```ts
if (existing) {
  // Fetch full row to check onboardingCompleted
  const [fullRow] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, ctx.user.id))
    .limit(1);

  if (fullRow?.onboardingCompleted) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Onboarding has already been completed",
    });
  }
}
```

Or use a conditional update that only matches `onboardingCompleted = false`.

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | CRITICAL | `notification/list.ts:14` | `isNull` on NOT NULL column — unread filter always returns empty |
| 2 | HIGH | `billing/index.ts:32-39` | `getSubscriptionStatus` missing `BILLING_ENABLED` guard |
| 3 | HIGH | `settings/update-*.ts` | Race condition in SELECT-then-INSERT pattern (primary key violation) |
| 4 | MEDIUM | `settings/complete-onboarding.ts` | No guard against re-completing onboarding (state machine violation) |
