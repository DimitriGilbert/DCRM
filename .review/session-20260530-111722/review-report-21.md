# Code Review Report - Cluster 21: Incoming Webhook Router

**Reviewer**: Code Review Expert (Cluster 21)
**Date**: 2026-05-30
**Files Reviewed**: 9 files in `packages/api/src/routers/incoming-webhook/`
**Focus**: Security (unauthenticated receiver endpoint), data flow (payload mapping), input validation

---

## Executive Summary

The incoming webhook subsystem is **well-designed and well-implemented**. The code demonstrates thoughtful security practices including:

- All CRUD operations behind `protectedProcedure` with proper `userId` scoping
- The unauthenticated receiver endpoint uses a high-entropy urlToken (`nanoid(32)` = ~192 bits of entropy) as authentication, with optional HMAC-SHA256 signature verification
- Timing-safe HMAC comparison prevents timing attacks
- Webhook secrets are never returned in API responses (stripped and replaced with `hasSecret` boolean)
- New webhooks always start in `test` mode, requiring explicit activation to `live`
- Input validation via Zod schemas on all endpoints
- Payload body size limit (1MB) enforced at the HTTP handler layer
- Unique index on `urlToken` in the database ensures token uniqueness and fast lookups
- JSON mapping engine is read-only (no prototype pollution risk)
- Proper ownership checks on all mutations

One finding identified.

---

## Findings

### [SEVERITY: MEDIUM] Finding 1: Non-atomic event emission allows duplicate events on transient failure

**File**: `packages/api/src/routers/incoming-webhook/receiver.ts:74-78` (delegating to `packages/webhooks/src/incoming.ts:253-255`)

**Problem**: The live-mode webhook processing performs two database operations — event insertion and `lastReceivedAt` update — without a transaction. If the event is successfully inserted but the subsequent `updateLastReceived` call fails (transient DB error, connection drop, process crash), the caller receives a 5xx error and will retry. Since `emitEvent` generates a new `randomUUID()` on each invocation, the retry creates a **duplicate event** with a different ID but identical payload.

**Evidence**:
In `packages/webhooks/src/incoming.ts`:
```typescript
// Line 253-255
const event = await emitEvent(deps.persister, eventInput);   // Step 1: INSERT event
await deps.updateLastReceived(webhook.id);                    // Step 2: UPDATE webhook
```

In `packages/events/src/emitter.ts`:
```typescript
// Line 74
const id = randomUUID();  // New UUID every call — no idempotency
```

In `packages/api/src/routers/incoming-webhook/receiver.ts`:
```typescript
// Lines 45-58 — persister has no transaction wrapping
const persister: EventPersister = {
  async insert(row) {
    await db.insert(events).values({ ... });
  },
};
```

**Impact**: Duplicate events appear in the user's event feed. Downstream consumers (hooks, automations) may process the same webhook payload twice — e.g., creating duplicate contacts or duplicate activities from a single external webhook delivery. The probability is low (requires a failure in the millisecond window between two DB calls) but the impact is real data duplication.

**Suggestion**: Wrap the event insert and `lastReceivedAt` update in a Drizzle transaction so both succeed or both roll back atomically:

```typescript
// In receiver.ts, restructure the persister to accept a transaction
const persister: EventPersister = {
  async insert(row) {
    await db.insert(events).values({ ... });
  },
};

// Or: pass a transaction-aware DB handle into handleIncomingWebhook
// so the caller can wrap both operations:

await db.transaction(async (tx) => {
  const txPersister: EventPersister = {
    async insert(row) { await tx.insert(events).values({ ... }); },
  };
  const event = await emitEvent(txPersister, eventInput);
  await tx
    .update(incomingWebhooks)
    .set({ lastReceivedAt: new Date() })
    .where(eq(incomingWebhooks.id, webhook.id));
});
```

Alternatively, add an idempotency mechanism (e.g., a hash of `urlToken + rawBody` checked before inserting) to make the endpoint safely retriable without transactions.

---

## Items Reviewed and Confirmed Correct

The following areas were carefully examined and found to be properly handled:

| Area | Status | Notes |
|------|--------|-------|
| Authentication on CRUD | ✅ Correct | All use `protectedProcedure` |
| Authorization (userId scoping) | ✅ Correct | All queries/mutations filter by `ctx.user.id` |
| Unauthenticated receiver security | ✅ Correct | urlToken (192-bit entropy) + optional HMAC-SHA256 |
| Timing-safe HMAC comparison | ✅ Correct | Uses `crypto.timingSafeEqual` |
| Secret exposure in API responses | ✅ Correct | Stripped in `read.ts` and `list.ts`, never returned |
| New webhook defaults to test mode | ✅ Correct | `mode: "test"` hardcoded in `create.ts` |
| Input validation (Zod schemas) | ✅ Correct | All endpoints have validated schemas |
| JSON injection / prototype pollution | ✅ Safe | Mapper is read-only, no `__proto__` writes |
| Request body size limit | ✅ Correct | 1MB limit in HTTP handler (`$token.ts`) |
| DB index on urlToken | ✅ Correct | Unique index ensures fast lookup and uniqueness |
| Delete idempotency | ✅ Correct | Returns `{ id }` regardless of rows affected |
| Ownership check before update | ✅ Correct | Select-then-update pattern with userId filter |

---

**Total findings: 1** (0 CRITICAL, 0 HIGH, 1 MEDIUM)
