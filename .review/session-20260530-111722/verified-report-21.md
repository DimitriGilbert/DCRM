# Verified Review Report — Cluster 21: Incoming Webhook Router

**Verification Agent**: Code Review Verification
**Date**: 2026-05-30
**Original Report**: review-report-21.md
**Verdict**: 1 CONFIRMED / 0 DISMISSED

---

### Finding 1: Non-atomic event emission allows duplicate events on transient failure — CONFIRMED

**Original**: The live-mode webhook processing performs event insertion and `lastReceivedAt` update as two separate DB operations without a transaction. If the event is inserted but the timestamp update fails, the caller retries and creates a duplicate event with a different UUID.

**Verification**: Actual source code confirms the full chain:

1. **`packages/webhooks/src/incoming.ts:253–255`** — two sequential DB operations, no transaction:
   ```typescript
   const event = await emitEvent(deps.persister, eventInput);   // Step 1: INSERT event
   await deps.updateLastReceived(webhook.id);                    // Step 2: UPDATE webhook
   ```
   These are sequential `await` calls with no `db.transaction` wrapping.

2. **`packages/events/src/emitter.ts:74`** — new UUID per invocation, no idempotency:
   ```typescript
   const id = randomUUID();
   ```
   Every call to `emitEvent` generates a fresh UUID, so retries produce duplicate events with different IDs.

3. **`packages/api/src/routers/incoming-webhook/receiver.ts:45–58`** — persister uses bare `db.insert`:
   ```typescript
   const persister: EventPersister = {
     async insert(row) {
       await db.insert(events).values({
         id: row.id,
         userId: row.userId,
         type: row.type,
         source: row.source,
         entityType: row.entityType,
         entityId: row.entityId,
         payload: row.payload,
         changes: row.changes ?? null,
         createdAt: new Date(),
       });
     },
   };
   ```
   No transaction awareness — this is a direct insert against `db`, not `tx`.

4. **`receiver.ts:38–43`** — `updateLastReceived` also uses bare `db`:
   ```typescript
   async function updateLastReceived(id: string): Promise<void> {
     await db
       .update(incomingWebhooks)
       .set({ lastReceivedAt: new Date() })
       .where(eq(incomingWebhooks.id, id));
   }
   ```

5. **Retry behavior**: If Step 2 (`updateLastReceived`) fails after Step 1 (`emitEvent`) succeeds, the error propagates through `handleIncomingWebhook` → `receiveIncomingWebhook` → the HTTP handler. The webhook caller (external service) receives a 5xx and will typically retry with the same payload. The retry invokes `emitEvent` again with a **new** `randomUUID()`, inserting a duplicate event.

**Verdict**: CONFIRMED. The two DB operations are genuinely non-atomic, and the lack of idempotency in event ID generation means retries create duplicate events. The probability is low (requires failure in the millisecond gap between two DB calls) but the impact is real — duplicate events in the user's feed and potential double-processing by downstream hooks/automations.

---

## Verification Summary

| Finding | Title | Verdict |
|---------|-------|---------|
| 1 | Non-atomic event emission allows duplicate events | CONFIRMED |

**Total**: 1 CONFIRMED / 0 DISMISSED
