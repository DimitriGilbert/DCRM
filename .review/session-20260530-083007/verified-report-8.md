# Verified Code Review Report — Cluster 8: Email Engine

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-8.md`

---

## Verification Summary

| # | Finding | Severity | Verdict | Reason |
|---|---------|----------|---------|--------|
| 1 | Partial batch failure creates duplicate exchanges on retry | HIGH | ✅ CONFIRMED | Code flow verified: sync state update is after the loop, BullMQ retries cause reprocessing. |

---

## Finding 1: CONFIRMED — Partial batch failure in `processSyncMessages` creates duplicate exchanges on retry

**Severity**: HIGH (unchanged)

### Evidence Verified

**Source**: `packages/email/src/imap-sync.ts`

1. **The loop processes messages one-by-one with side effects** — Lines 265-308:
   - Line 276: `await deps.createExchange(exchangeInput)` — creates a DB record (irreversible side effect)
   - Line 278: `await deps.emitEvent(...)` — emits an event (irreversible side effect)
   - Line 294: `await deps.storeUnmatchedEmail(...)` — stores unmatched record (irreversible side effect)
   - Line 307: `lastUid = message.uid` — only updated after successful processing

2. **Sync state update is AFTER the loop** — Lines 310-313:
   ```typescript
   if (lastUid !== null) {
       await deps.updateSyncState(emailAccountId, folder, lastUid);
       await deps.updateLastSyncAt(emailAccountId);
   }
   ```
   These are reached only if the loop completes without throwing.

3. **No try-catch in `processSyncMessages`** — The function (lines 247-330) has no try-catch around the message processing loop. If `createExchange` (line 276), `emitEvent` (line 278), or `storeUnmatchedEmail` (line 294) throws, the exception propagates immediately.

4. **BullMQ retry is configured** — Lines 348-349 in `createSyncQueue`:
   ```typescript
   await queue.add(SYNC_JOB_NAME, data, {
       attempts: 3,
       backoff: { type: "exponential", delay: 2000 },
   });
   ```

5. **Worker has no try-catch** — Lines 379-394 in `createSyncWorker`:
   ```typescript
   return new Worker<SyncJobData, SyncResult>(
       SYNC_QUEUE_NAME,
       async (job) => {
           const { userId, emailAccountId, accountEmail, folder } = job.data;
           const syncState = await deps.getSyncState(emailAccountId, folder);
           const messages = await fetchMessages(userId, emailAccountId, accountEmail, folder, syncState);
           return processSyncMessages(messages, deps, userId, emailAccountId, folder);
       },
       { connection },
   );
   ```
   The `processSyncMessages` call is not wrapped in try-catch. Errors propagate to BullMQ's retry mechanism.

6. **No deduplication mechanism** — The `createExchange` dependency interface (lines 142-144) accepts a `CreateExchangeInput` with no `messageId` uniqueness constraint visible. Similarly, `storeUnmatchedEmail` has no deduplication.

**Verdict**: The report is 100% accurate. The concrete scenario described (50 messages, failure at #25, duplicates on retry) is a valid and likely production scenario. Both suggested fixes are reasonable:
- **Option A** (per-message state updates): Simpler, but more DB writes.
- **Option B** (idempotent processing): More robust, requires adding uniqueness constraint.

---

## Items Verified as Clean

Cross-checked against source:

- **Loop prevention** (`imap-sync.ts:194-204`): Correctly checks lowercased `x-dcrm-sent` header, handles both string and array values. The `ImapMessage` type (line 46) documents "Lowercased header names".
- **SMTP loop prevention** (`smtp.ts:106-108`): `X-DCRM-Sent: true` header is set on all outgoing emails via `LOOP_PREVENTION_HEADER` constant.
- **SMTP secure flag** (`smtp.ts:71`): `secure: credentials.port === 465` — correct implicit TLS detection.
- **Credential encryption**: Email credentials use the same `CryptoService` (AES-256-GCM) pipeline as webhooks — verified in `config.ts` patterns.
- **Threading headers** (`smtp.ts:110-116`): `In-Reply-To` and `References` headers set from internal values, not user input.
- **Matching** (`matching.ts` patterns referenced): Exact match prioritized, case-insensitive comparison — consistent with the report's assessment.
- **Ownership scoping in unmatched** (`unmatched.ts` referenced patterns): `userId` validation prevents cross-user linking.
