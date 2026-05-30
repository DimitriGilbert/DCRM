# Code Review Report — Cluster 12: Billing Package

**Reviewer**: Code Review Expert (Automated)
**Date**: 2026-05-30
**Files Reviewed**:
- `packages/billing/src/index.ts`
- `packages/billing/src/subscription.ts`
- `packages/billing/src/stripe.ts`
- `packages/billing/src/middleware.ts`
- `packages/billing/__tests__/billing.test.ts`

**Related files examined for context**:
- `packages/db/src/schema/automation.ts` (subscriptions table schema)
- `packages/domain/src/billing.ts` (BillingStatus type)
- `packages/api/src/routers/billing/index.ts` (API consumer of this package)

---

## Summary

3 findings. The billing package is well-structured overall — webhook signature verification is correct, the Stripe client is lazily initialized, status mapping covers all relevant Stripe states, and the env-gated bypass path works correctly. The issues below are real correctness problems, not stylistic concerns.

---

### [SEVERITY: HIGH] Finding 1: Non-deterministic subscription query — no ORDER BY on user lookup

**File**: `packages/billing/src/subscription.ts:44-48` (also `packages/api/src/routers/billing/index.ts:57-61`)

**Problem**: `getStatus()` queries subscriptions by `userId` with `LIMIT 1` but no `ORDER BY`. The database schema has a unique index on `stripeSubscriptionId` but **no unique constraint on `userId`** — a user can accumulate multiple subscription rows (e.g., after canceling and re-subscribing, where a new `stripeSubscriptionId` is created by Stripe). Without ordering, PostgreSQL returns an arbitrary row, which may be a stale canceled subscription instead of the current active one.

**Evidence**:
```typescript
// subscription.ts:44-48
const rows = await db
  .select()
  .from(subscriptions)
  .where(eq(subscriptions.userId, userId))
  .limit(1);  // <-- no .orderBy()
```

The same pattern is duplicated in the API router at `billing/index.ts:57-61` for `createPortalSession`, which could open the billing portal for the wrong Stripe customer.

**Impact**:
- `getStatus()` returns a stale/incorrect status → user incorrectly denied or incorrectly granted access
- `createPortalSession()` fetches the wrong `stripeCustomerId` → user sees wrong billing portal, potentially unable to manage their actual subscription
- Financial: a user with an active subscription might be blocked, or a canceled user might retain access

**Suggestion**: Order by `currentPeriodEnd DESC` (or `updatedAt DESC`) to always prefer the most recent subscription:

```typescript
const rows = await db
  .select()
  .from(subscriptions)
  .where(eq(subscriptions.userId, userId))
  .orderBy(desc(subscriptions.currentPeriodEnd))
  .limit(1);
```

Apply the same fix in `packages/api/src/routers/billing/index.ts:57-61`. Alternatively, add a unique constraint on `userId` if the business rule is truly "one subscription per user" — but that would require cleanup of existing duplicate rows first.

---

### [SEVERITY: MEDIUM] Finding 2: Race condition in Stripe customer creation — no idempotency

**File**: `packages/billing/src/stripe.ts:59-73`

**Problem**: `createCheckoutSession` uses a check-then-create pattern to find or create a Stripe customer by email. Between the `customers.list()` call and the `customers.create()` call, another concurrent request for the same user can pass through the same check, resulting in two Stripe customers with the same email and `userId` metadata. Subsequent lookups by email return one arbitrarily, fragmenting subscription history across two customer objects.

**Evidence**:
```typescript
// stripe.ts:59-73
const customers = await stripe.customers.list({ email, limit: 1 });
let customerId: string;
if (customers.data.length > 0) {
  customerId = customers.data[0]!.id;  // <-- TOCTOU window opens here
} else {
  const customer = await stripe.customers.create({  // <-- race: both requests create
    email,
    metadata: { userId },
  });
  customerId = customer.id;
}
```

**Impact**:
- Duplicate Stripe customers for the same DCRM user
- Subsequent `createCheckoutSession` calls may attach subscriptions to the wrong customer
- Billing portal may show only partial subscription history
- Compounds with Finding 1 — duplicate subscriptions make the non-deterministic query more likely to return the wrong row

**Suggestion**: Use Stripe's idempotency key to make customer creation idempotent:

```typescript
const customers = await stripe.customers.list({ email, limit: 1 });

let customerId: string;
if (customers.data.length > 0) {
  customerId = customers.data[0]!.id;
} else {
  const customer = await stripe.customers.create(
    { email, metadata: { userId } },
    { idempotencyKey: `customer-create-${userId}` },
  );
  customerId = customer.id;
}
```

The idempotency key based on `userId` ensures that even if two requests race, only one customer is created.

---

### [SEVERITY: MEDIUM] Finding 3: Swallowed errors in `getSubscription` — no logging, no distinction between "not found" and "failure"

**File**: `packages/billing/src/stripe.ts:124-131`

**Problem**: `getSubscription` catches all exceptions and returns `null` with no logging. This conflates "subscription does not exist" (a valid business state) with "Stripe is down / auth failed / rate limited" (an infrastructure error). Callers cannot distinguish these cases and will treat both as "no subscription found."

**Evidence**:
```typescript
async getSubscription(subscriptionId) {
  const stripe = getStripeClient();
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {    // <-- catches EVERYTHING, including auth/rate-limit/network errors
    return null;  // <-- silently swallowed, no log
  }
},
```

**Impact**:
- Currently unused in the billing router, but it is part of the exported public API (`StripeService` interface)
- When consumed: a Stripe outage would cause all subscription lookups to return `null` → all users appear to have no subscription → all users lose access, or alternatively, no graceful degradation is possible
- Impossible to debug in production — zero observability for the failure path

**Suggestion**: At minimum, log the error. Ideally, distinguish between "not found" (Stripe returns 404) and other failures:

```typescript
async getSubscription(subscriptionId) {
  const stripe = getStripeClient();
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return null; // subscription genuinely doesn't exist
    }
    console.error("Failed to retrieve Stripe subscription", subscriptionId, error);
    throw error; // re-throw infrastructure errors so callers can handle them
  }
},
```

This lets callers distinguish "doesn't exist" from "something went wrong" and handle each appropriately.
