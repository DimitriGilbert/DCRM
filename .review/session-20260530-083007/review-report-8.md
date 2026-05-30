# Code Review Report — Cluster 8: Email Engine

**Reviewer**: Code Reviewer - Cluster 8
**Date**: 2026-05-30
**Files Reviewed**:
- `packages/email/src/index.ts`
- `packages/email/src/smtp.ts`
- `packages/email/src/imap-sync.ts`
- `packages/email/src/threading.ts`
- `packages/email/src/matching.ts`
- `packages/email/src/config.ts`
- `packages/email/src/unmatched.ts`
- `packages/email/__tests__/smtp.test.ts`
- `packages/email/__tests__/imap-sync.test.ts`
- `packages/email/__tests__/threading.test.ts`
- `packages/email/__tests__/matching.test.ts`

---

## Summary

The email engine package is well-structured with clean separation of concerns. SMTP sending, IMAP sync, threading, matching, credential encryption, and unmatched email handling are each isolated into focused modules with injected dependencies for testability. The code is consistent, well-documented, and the test coverage is thorough.

**One significant data integrity issue was found** in the sync pipeline's batch processing logic. The remaining code is solid — security patterns for credential encryption (AES-256-GCM), loop prevention headers, and owner-scoped operations are all correctly implemented.

---

### [SEVERITY: HIGH] Finding 1: Partial batch failure in `processSyncMessages` creates duplicate exchanges on retry

**File**: `packages/email/src/imap-sync.ts:[265-313]`
**Problem**: When `processSyncMessages` processes a batch of IMAP messages and one of the downstream operations (`createExchange`, `emitEvent`, or `storeUnmatchedEmail`) throws mid-batch, the function exits without updating the sync state. BullMQ retries the job, but since the sync state wasn't updated, `fetchMessages` returns the **entire same batch**. All previously-processed messages are re-processed, creating **duplicate exchanges and duplicate unmatched email records**.

**Evidence**:
```typescript
// imap-sync.ts — simplified flow
for (const message of messages) {
    // ... process each message (createExchange, storeUnmatchedEmail, etc.) ...
    lastUid = message.uid;  // only set if no throw
}

// These run AFTER the loop — never reached if the loop throws
if (lastUid !== null) {
    await deps.updateSyncState(emailAccountId, folder, lastUid);  // line 311
    await deps.updateLastSyncAt(emailAccountId);                   // line 312
}
```

The BullMQ worker at line 381 wraps this without any try/catch, so errors propagate to BullMQ's retry mechanism. With `attempts: 3` configured (line 349), each retry re-processes the full batch, compounding duplicates.

**Concrete scenario**:
1. Batch of 50 messages arrives
2. Messages 1–24 are processed successfully (24 exchanges created, 24 events emitted)
3. Message 25's `createExchange` throws (e.g., DB timeout)
4. Function exits — `updateSyncState` never called
5. BullMQ retries: all 50 messages fetched again
6. Messages 1–24 processed again → **48 duplicate exchanges** (24 original + 24 duplicates)
7. If message 25 fails again, retry again → **72 duplicate exchanges** (24 × 3)

**Impact**: Duplicate CRM entries for the same email. Each duplicate exchange triggers a duplicate `exchange.created` event. Users see multiple entries in their timeline for a single email. No deduplication mechanism exists in `createExchange` or `storeUnmatchedEmail` (no uniqueness constraint on `messageId` visible in the deps interface).

**Suggestion**: Two complementary fixes:

**Option A — Per-message state updates (simpler):** Update sync state after each successfully processed message, not after the entire batch:

```typescript
for (const message of messages) {
  try {
    // ... process message ...
    lastUid = message.uid;
    // Update state incrementally so retries skip already-processed messages
    await deps.updateSyncState(emailAccountId, folder, lastUid);
  } catch (error) {
    // Log and continue, or re-throw after updating to last successful UID
    // The next sync will pick up from this point
    throw error;
  }
}
```

**Option B — Idempotent processing (more robust):** Add deduplication by `messageId` in the `createExchange` dependency (upsert or skip-if-exists), making retries safe even if the same message is processed twice:

```typescript
// In the createExchange dep implementation:
const existing = await db.select().from(exchanges)
  .where(eq(exchanges.metadata->>'messageId', input.metadata.messageId))
  .limit(1);
if (existing.length > 0) return existing[0];
// proceed with insert
```

Option A is the minimal fix; Option B provides defense-in-depth.

---

## Items Reviewed — No Issues Found

The following were specifically examined and found to be correctly implemented:

| Area | Assessment |
|------|-----------|
| **SMTP credential handling** (`smtp.ts`, `config.ts`) | Credentials encrypted at rest via AES-256-GCM (`@DCRM/crypto`). Keys never logged or exposed. `createNodemailerTransport` uses `secure: true` for port 465 (implicit TLS). |
| **IMAP auth** (`config.ts`) | IMAP credentials encrypted/decrypted through same AES-256-GCM pipeline. Decrypted only at connection time. |
| **Email header injection** (`smtp.ts`) | Custom headers (`X-DCRM-Sent`, `In-Reply-To`, `References`) are set programmatically from internal values, not from user input. Nodemailer's `sendMail` sanitizes CRLF in addresses and subjects. |
| **Loop prevention** (`imap-sync.ts` line 194) | Correctly checks lowercased header name (`x-dcrm-sent`) matching the `ImapMessage` contract ("Lowercased header names"). Handles both string and array header values. |
| **Threading logic** (`threading.ts`) | Chronological sort for References chain, latest messageId for In-Reply-To. Follows RFC 2822 threading semantics. |
| **Matching correctness** (`matching.ts`) | Exact match prioritized over wildcard. Case-insensitive comparison. Wildcard only matches `*@domain.com` format. |
| **Ownership scoping** (`unmatched.ts` line 134) | `linkUnmatchedEmail` validates `record.userId !== userId` preventing cross-user linking. Double-link guard via `linkedEntityId !== null` check. |
| **Error propagation** (`smtp.ts` line 152 test) | Transport errors are not swallowed — they propagate to the caller. |
| **Encryption integrity** (`config.ts` + `crypto`) | AES-256-GCM provides authenticated encryption (tamper detection via auth tag). `JSON.parse` in `decryptField` will throw on corrupted data rather than returning garbage. |
