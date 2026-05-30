# Verified Report — Cluster 12: Billing Package

**Original Report**: `review-report-12.md`
**Verdict**: 3 findings — all **CONFIRMED**.

---

## Verification Method

Read all source files referenced in the findings:
- `packages/billing/src/subscription.ts` (183 lines, full file)
- `packages/db/src/schema/automation.ts:364-389` (subscriptions table schema)
- `packages/domain/src/billing.ts` (BillingStatus type definition)
- `packages/api/src/routers/billing/index.ts` (webhook handler)

---

### Finding 1: Race Condition in `upsertFromStripe` — ✅ CONFIRMED

**Severity**: HIGH (unchanged)

**Evidence verified**:

`subscription.ts:101-105` — SELECT check:
```ts
const existing = await db
  .select()
  .from(subscriptions)
  .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id))
  .limit(1);
```

`subscription.ts:107-129` — Branch: UPDATE if exists, INSERT if not:
```ts
if (existing.length > 0) {
  await db.update(subscriptions)...  // line 108-117
} else {
  await db.insert(subscriptions).values({ id: nanoid(), ... }); // line 119-128
}
```

`automation.ts:364-389` — Schema has NO unique constraint:
```ts
stripeSubscriptionId: text("stripe_subscription_id"),  // line 372 — no .unique()
// indexes at line 385-388:
(table) => [
  index("subscriptions_user_id_idx").on(table.userId),
  index("subscriptions_status_idx").on(table.status),
  // NO uniqueIndex on stripeSubscriptionId
],
```

**Verdict**: CONFIRMED. Classic TOCTOU race condition. Two concurrent webhook deliveries for the same `stripeSubscriptionId` can both pass the `existing.length === 0` check and both INSERT, creating duplicate rows. The database schema does not prevent this — no unique constraint exists on `stripeSubscriptionId`.

**Impact is real**: The `getStatus` method (line 44-48) uses `eq(subscriptions.userId, userId).limit(1)` without ordering. If duplicates exist, it returns whichever row PostgreSQL happens to return — potentially a stale one with wrong status.

**Suggested fix from original report is correct**: Add `uniqueIndex` on `stripeSubscriptionId` and use `onConflictDoUpdate`.

---

### Finding 2: `past_due` Subscriptions Treated as Inactive — ✅ CONFIRMED

**Severity**: MEDIUM (unchanged)

**Evidence verified**:

`subscription.ts:60-61` — Active status check:
```ts
const activeStatuses: BillingStatus[] = ["active", "trialing"];
const isActive = activeStatuses.includes(sub.status as BillingStatus);
```

`domain/billing.ts:3-9` — The domain model defines `past_due` as a valid status:
```ts
export const BILLING_STATUSES = {
  ACTIVE: "active",
  PAST_DUE: "past_due",    // ← defined in domain model
  CANCELED: "canceled",
  TRIALING: "trialing",
  INACTIVE: "inactive",
} as const;
```

`subscription.ts:75` — The `mapStripeStatus` function correctly maps `past_due`:
```ts
past_due: "past_due",
```

So the status is stored correctly in the DB — the issue is purely in the `isActive` determination at line 60. A subscription with stored `status = "past_due"` will return `active: false` from `getStatus`.

**Verdict**: CONFIRMED. The domain model explicitly defines `PAST_DUE` as a distinct status, the Stripe mapper preserves it, but the `isActive` check excludes it. Whether to include `past_due` as "active" is a product decision, but the current behavior (immediate access revocation on payment failure with no grace period) should at minimum be documented.

---

### Finding 3: Webhook Event Silently Dropped When `metadata.userId` Is Missing — ✅ CONFIRMED

**Severity**: MEDIUM (unchanged)

**Evidence verified**:

`subscription.ts:86-87` — Silent return with no logging:
```ts
const userId = stripeSub.metadata?.userId;
if (!userId) return;
```

`billing/index.ts:101-121` — Webhook handler returns success regardless:
```ts
switch (event.type) {
  case "customer.subscription.created":
  case "customer.subscription.updated": {
    const subscription = event.data.object;
    await subscriptionService.upsertFromStripe(subscription);  // silently returns if no userId
    break;
  }
  // ...
}
return { received: true };  // line 120 — always returns success to Stripe
```

**Verdict**: CONFIRMED. If a subscription event arrives without `metadata.userId`, `upsertFromStripe` returns immediately at line 87 with no logging, no error, and no side effect. The webhook handler at line 120 returns `{ received: true }` to Stripe, so Stripe considers the delivery successful and will NOT retry. The local subscription state is never updated.

**Impact is real**: Subscriptions created outside the normal checkout flow (Stripe Dashboard, Stripe CLI, or if metadata is accidentally cleared) will never sync to the local DB. No error, no log, no retry.

**Suggested fix from original report is correct**: At minimum, add `console.warn()` logging.

---

## Summary

| Finding | Original Severity | Verdict | Notes |
|---------|------------------|---------|-------|
| F1: TOCTOU race in upsert | HIGH | ✅ CONFIRMED | Real data integrity risk — no unique constraint + check-then-act |
| F2: past_due treated as inactive | MEDIUM | ✅ CONFIRMED | Product decision needed — domain model has `past_due` but `isActive` excludes it |
| F3: Silent webhook drop | MEDIUM | ✅ CONFIRMED | No logging, no error, Stripe considers delivery successful |

Zero false positives in the original report.
