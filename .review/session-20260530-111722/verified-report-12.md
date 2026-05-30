# Verified Code Review Report — Cluster 12: Billing Package

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-12.md

---

### Finding 1: Non-deterministic subscription query — no ORDER BY on user lookup — CONFIRMED

**Original**: `getStatus()` queries subscriptions by `userId` with `LIMIT 1` but no `ORDER BY`. The table has no unique constraint on `userId`, allowing multiple subscription rows per user. PostgreSQL returns an arbitrary row.

**Verification/Reason**:

The query is confirmed at subscription.ts:44-48:
```typescript
const rows = await db
  .select()
  .from(subscriptions)
  .where(eq(subscriptions.userId, userId))
  .limit(1);  // no .orderBy()
```

No `orderBy()` call exists. Confirmed.

The subscriptions table schema (automation.ts:366-392) confirms the index situation:
- `index("subscriptions_user_id_idx").on(table.userId)` — regular index, NOT unique. Confirmed.
- `uniqueIndex("subscriptions_stripe_sub_id_idx").on(table.stripeSubscriptionId)` — unique on Stripe subscription ID only.
- **No unique constraint on `userId`**. Confirmed — multiple rows per user are allowed.

The duplicate in the API router is confirmed at billing/index.ts:57-61:
```typescript
const rows = await db
  .select()
  .from(subscriptions)
  .where(eq(subscriptions.userId, ctx.user.id))
  .limit(1);  // no .orderBy()
```

Same pattern, same issue. Confirmed.

The `upsertFromStripe` method (subscription.ts:85-127) upserts by `stripeSubscriptionId`, meaning each Stripe subscription gets its own row. If a user cancels and re-subscribes, Stripe creates a new subscription ID, and the old row (with `status: "canceled"`) remains while a new row (with `status: "active"`) is added. Without `ORDER BY`, `LIMIT 1` may return either row.

**Severity upheld**: HIGH. This is a genuine correctness bug that can cause:
- Active subscriber denied access (stale canceled row returned)
- Canceled subscriber retains access (stale active row returned)
- Wrong Stripe customer portal opened

The fix suggestion (`orderBy(desc(subscriptions.currentPeriodEnd))` or `orderBy(desc(subscriptions.createdAt))`) is correct.

---

### Finding 2: Race condition in Stripe customer creation — no idempotency — CONFIRMED (low practical probability)

**Original**: `createCheckoutSession` uses check-then-create pattern for Stripe customers. Concurrent requests could create duplicate Stripe customers with the same email.

**Verification/Reason**:

The check-then-create pattern is confirmed at stripe.ts:59-73:
```typescript
const customers = await stripe.customers.list({ email, limit: 1 });
let customerId: string;
if (customers.data.length > 0) {
  customerId = customers.data[0]!.id;
} else {
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  customerId = customer.id;
}
```

TOCTOU window between `customers.list()` (line 59) and `customers.create()` (line 68) is confirmed. No idempotency key is passed to `customers.create()`. Confirmed.

**Mitigating context**: This is a single-user CRM (AGENTS.md: "Single-user only"). The only realistic race scenario is a user double-clicking "Subscribe" or having two browser tabs open simultaneously. The report's severity of MEDIUM is appropriate given the low probability but real (if annoying) impact.

**The suggested fix** (idempotency key: `{ idempotencyKey: 'customer-create-${userId}' }`) is correct. Stripe's idempotency guarantees that only one customer is created even under concurrent requests.

**Severity upheld**: MEDIUM. The race condition is real. Single-user constraint makes it unlikely but not impossible.

---

### Finding 3: Swallowed errors in `getSubscription` — no logging, no distinction — CONFIRMED (unused code)

**Original**: `getSubscription` catches all exceptions and returns `null`, conflating "not found" with infrastructure failures.

**Verification/Reason**:

The catch-all is confirmed at stripe.ts:124-131:
```typescript
async getSubscription(subscriptionId) {
  const stripe = getStripeClient();
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {    // catches EVERYTHING
    return null;  // silently swallowed
  }
},
```

No error logging. No distinction between Stripe error types. Confirmed.

**Critical context**: The method is **currently unused**. A grep for `getSubscription` across all `.ts` files shows it only defined in stripe.ts (line 49 interface, line 124 implementation). No consumer calls it. The report correctly notes: "Currently unused in the billing router, but it is part of the exported public API (`StripeService` interface)."

**Severity**: MEDIUM as rated is appropriate for unused exported API surface. The finding is valid — when a future consumer uses this method, a Stripe outage would silently return `null` for all subscriptions, potentially causing all users to lose access. The suggested fix (distinguish `StripeInvalidRequestError` from other errors, log and re-throw infrastructure failures) is correct.

**Severity upheld**: MEDIUM for exported API surface quality, though current impact is zero.

---

## Summary

| # | Severity | Verdict | File | Finding |
|---|----------|---------|------|---------|
| 1 | HIGH | **CONFIRMED** | subscription.ts, billing/index.ts | No ORDER BY on subscription query + no unique constraint on userId → non-deterministic results |
| 2 | MEDIUM | **CONFIRMED** | stripe.ts | TOCTOU race in Stripe customer creation — mitigated by single-user constraint |
| 3 | MEDIUM | **CONFIRMED** (unused) | stripe.ts | Swallowed errors in unused `getSubscription` — latent observability gap in exported API |

**Total findings: 3 — 3 confirmed, 0 dismissed**
