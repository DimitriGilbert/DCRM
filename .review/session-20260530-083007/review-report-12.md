# Code Review Report — Cluster 12: Billing Package

**Reviewer**: Code Review Expert (Security Focus)
**Date**: 2026-05-30
**Files Reviewed**:
- `packages/billing/src/index.ts`
- `packages/billing/src/stripe.ts`
- `packages/billing/src/subscription.ts`
- `packages/billing/src/middleware.ts`
- `packages/billing/__tests__/billing.test.ts`

**Additional context examined**: `packages/api/src/routers/billing/index.ts`, `packages/db/src/schema/automation.ts` (subscriptions table), `packages/domain/src/billing.ts`

---

### [SEVERITY: HIGH] Finding 1: Race Condition in `upsertFromStripe` Can Create Duplicate Subscription Records

**File**: `packages/billing/src/subscription.ts:101-129`
**Schema File**: `packages/db/src/schema/automation.ts:364-389`

**Problem**: The `upsertFromStripe` method uses a check-then-act (TOCTOU) pattern — it first SELECTs to check if a subscription exists, then either UPDATEs or INSERTs. This is not atomic. Stripe webhooks can be delivered concurrently (retries, or rapid `created` → `updated` event succession). Two concurrent invocations for the same `stripeSubscriptionId` can both see no existing row and both INSERT, creating duplicate records. The `subscriptions` table has **no unique constraint** on `stripeSubscriptionId`, so the database will not prevent this.

**Evidence**:
```typescript
// subscription.ts:101-129
const existing = await db
  .select()
  .from(subscriptions)
  .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id))
  .limit(1);

if (existing.length > 0) {
  await db.update(subscriptions)...
} else {
  await db.insert(subscriptions).values({ id: nanoid(), ... });
}
```

Schema has no unique constraint:
```typescript
// automation.ts:364-389
export const subscriptions = pgTable(
  "subscriptions",
  {
    stripeSubscriptionId: text("stripe_subscription_id"), // no .unique()
    ...
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_status_idx").on(table.status),
    // no uniqueIndex on stripeSubscriptionId
  ],
);
```

**Impact**: Duplicate subscription records for the same Stripe subscription. The `getStatus` method uses `.limit(1)` without ordering, so it may return a stale/duplicate row. This can cause:
- A canceled subscription showing as active (if one of the duplicates was not updated)
- An active subscription showing as inactive (if the stale duplicate is returned)
- Conflicting billing states that could allow billing bypass or incorrectly block a paying user

**Suggestion**: 
1. Add a unique index on `stripeSubscriptionId` in the schema:
   ```typescript
   uniqueIndex("subscriptions_stripe_sub_id_idx").on(table.stripeSubscriptionId),
   ```
2. Use a proper upsert (Drizzle's `onConflictDoUpdate`) instead of check-then-act:
   ```typescript
   await db
     .insert(subscriptions)
     .values({
       id: nanoid(),
       userId,
       stripeCustomerId: customerId,
       stripeSubscriptionId: stripeSub.id,
       status,
       currentPeriodStart: periodStart,
       currentPeriodEnd: periodEnd,
       cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
     })
     .onConflictDoUpdate({
       target: subscriptions.stripeSubscriptionId,
       set: {
         status,
         currentPeriodStart: periodStart,
         currentPeriodEnd: periodEnd,
         cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
         updatedAt: new Date(),
       },
     });
   ```
   If no existing row matches the `userId` from metadata on conflict, the insert will create a new row; if one exists, it updates atomically.

---

### [SEVERITY: MEDIUM] Finding 2: `past_due` Subscriptions Treated as Inactive — Paying Users Lose Access Immediately on Payment Failure

**File**: `packages/billing/src/subscription.ts:60-61`

**Problem**: The `isActive` determination only includes `["active", "trialing"]`. In Stripe, a `past_due` subscription means a payment attempt failed but the subscription has **not yet been canceled**. Stripe provides a configurable grace period (via `subscription_settings.default_behavior`) before canceling. During this grace period, the subscriber is still a paying customer whose payment is being retried. The current code immediately revokes access on `past_due`, effectively providing zero grace period regardless of Stripe's retry configuration.

**Evidence**:
```typescript
// subscription.ts:60-61
const activeStatuses: BillingStatus[] = ["active", "trialing"];
const isActive = activeStatuses.includes(sub.status as BillingStatus);
```

**Impact**: A legitimate paying user whose card was temporarily declined (common with expiring cards, bank holds, etc.) would immediately lose CRM access. They would be blocked from their own data until the payment retry succeeds or they manually update their card. For a single-user CRM where this is the user's business-critical tool, this is a poor experience. Stripe's Smart Retries will typically resolve the payment within 24-72 hours.

**Suggestion**: Consider including `past_due` in the active statuses, or adding a separate grace-period check using `currentPeriodEnd`:
```typescript
const activeStatuses: BillingStatus[] = ["active", "trialing", "past_due"];
```
Or, if strict enforcement is desired, document this as an explicit product decision and add it as a comment explaining why no grace period is provided.

---

### [SEVERITY: MEDIUM] Finding 3: Webhook Event Silently Dropped When `metadata.userId` Is Missing

**File**: `packages/billing/src/subscription.ts:86-87`

**Problem**: If a Stripe subscription event arrives without `userId` in its metadata, `upsertFromStripe` returns immediately without any logging, error, or indication. The webhook handler in the API router returns `{ received: true }` regardless, so Stripe considers the webhook successfully delivered and will not retry. The subscription state in the local DB is never created or updated.

**Evidence**:
```typescript
// subscription.ts:86-87
const userId = stripeSub.metadata?.userId;
if (!userId) return;
```

```typescript
// API router billing/index.ts:120
return { received: true };
```

**Impact**: If a subscription is created or updated outside the normal checkout flow (e.g., directly in the Stripe Dashboard, via Stripe CLI for testing, or if metadata is accidentally cleared), the event is silently dropped. The user's subscription status in the local DB becomes stale or never exists, potentially blocking their access despite having a valid Stripe subscription. This can be difficult to diagnose since there's no error or log.

**Suggestion**: At minimum, log a warning when this happens so it's observable:
```typescript
const userId = stripeSub.metadata?.userId;
if (!userId) {
  console.warn(
    `[billing] Subscription ${stripeSub.id} event (${stripeSub.status}) has no userId metadata — skipping`,
  );
  return;
}
```
Consider also storing a fallback record with a null userId that can be reconciled later, or throwing an error to trigger Stripe's retry mechanism (returning a non-200 response).

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 1 |
| MEDIUM   | 2 |

The most impactful issue is **Finding 1** — the TOCTOU race condition in `upsertFromStripe` combined with the missing unique constraint on `stripeSubscriptionId`. This is a data integrity bug that can cause duplicate subscription records leading to incorrect billing state. The fix is straightforward: add a unique index and switch to an atomic upsert with `onConflictDoUpdate`.

The Stripe webhook signature verification (`constructWebhookEvent`) is correctly implemented using the standard Stripe library method. The `BILLING_ENABLED` bypass in the middleware is intentional and properly gated. The checkout session and portal session flows are secure — they use authenticated context and don't accept user-controlled customer IDs.
