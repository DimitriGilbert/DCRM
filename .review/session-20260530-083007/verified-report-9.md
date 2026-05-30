# Verified Code Review Report — Cluster 9: Storage Package

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-9.md`

---

## Verification Summary

| # | Finding | Severity | Verdict | Reason |
|---|---------|----------|---------|--------|
| 1 | S3 backend accepts quota config but never enforces it | MEDIUM | ✅ CONFIRMED | S3 `put()` only checks `maxFileSize`; local `put()` also checks `userQuota`. The gap is real. |
| 2 | TOCTOU race condition in local backend quota enforcement | MEDIUM → LOW | ✅ CONFIRMED (downgraded) | The race is real but low practical impact for single-user CRM. |

---

## Finding 1: CONFIRMED — S3 backend accepts quota config but never enforces it

**Severity**: MEDIUM (unchanged)

### Evidence Verified

**Source**: `packages/storage/src/s3.ts`

1. **Quota is stored in `limits`** — Line 72: `this.limits = { maxFileSize: options.maxSize, userQuota: options.userQuota };`

2. **`getLimits()` reports the quota** — Lines 81-83:
   ```typescript
   getLimits(): StorageLimits {
       return { ...this.limits };
   }
   ```
   This returns `userQuota` to callers, making it appear a quota is in effect.

3. **`put()` never checks quota** — Lines 85-110:
   ```typescript
   async put(userId: string, key: string, data: Uint8Array, mimeType: string): Promise<StoredFile> {
       if (data.byteLength > this.limits.maxFileSize) {  // ← Only checks file size
           throw new StorageError(..., "FILE_TOO_LARGE");
       }
       // ← No quota check here
       const s3Key = this.s3Key(userId, key);
       // ... proceeds to upload
   }
   ```

4. **Compare with local backend** — `packages/storage/src/local.ts:152-160`:
   ```typescript
   if (this.limits.userQuota !== null) {
       const currentUsage = await this.calculateUsage(userId);
       if (currentUsage + data.byteLength > this.limits.userQuota) {
           throw new StorageError(..., "QUOTA_EXCEEDED");
       }
   }
   ```
   The local backend DOES enforce quota — the S3 backend does not.

5. **The `StorageBackend` interface contract** — `packages/storage/src/types.ts:27-78` defines `getLimits()` and `put()` as the interface. The `StorageLimits` type (lines 16-21) includes `userQuota`. Backends implementing this interface are expected to enforce the limits they report.

**Verdict**: The report is accurate. This is an API contract violation — the S3 backend claims it has a quota via `getLimits()` but never enforces it. The suggested fix (either implement enforcement or reject misconfiguration early) is reasonable.

---

## Finding 2: CONFIRMED (downgraded to LOW) — TOCTOU race condition in local backend quota enforcement

**Severity**: MEDIUM → **LOW** (downgraded for a single-user CRM)

### Evidence Verified

**Source**: `packages/storage/src/local.ts`

1. **The check-then-write pattern is real** — Lines 152-165:
   ```typescript
   // CHECK (async read)
   if (this.limits.userQuota !== null) {
       const currentUsage = await this.calculateUsage(userId);    // read
       if (currentUsage + data.byteLength > this.limits.userQuota) {
           throw new StorageError(..., "QUOTA_EXCEEDED");
       }
   }
   // WRITE (async write) — no lock between check and write
   const fullPath = this.resolvePath(userId, key);
   try {
       await this.fsOps.put(fullPath, data);
   }
   ```

2. **Two concurrent `put()` calls could both pass the check** — Between `calculateUsage` returning and `fsOps.put` completing, another async call could interleave. The `await` yields the event loop.

3. **The race is genuine** but:
   - This is a **single-user CRM** (explicitly stated in AGENTS.md: *"Single-user CRM only"*)
   - Concurrent uploads to the same storage backend for the same user are extremely unlikely
   - The quota enforcement is a **best-effort** guard, not a security boundary
   - Even if the quota is slightly exceeded, the impact is marginal (extra storage cost, not data corruption)

**Verdict**: The report is technically correct — the TOCTOU race exists. However, given the single-user nature of the application, I'm downgrading the severity to **LOW**. The suggested fix (per-user mutex) is over-engineering for this use case. The better recommendation is to add a comment documenting the trade-off, as the report's alternative suggestion states.

---

## Items Verified as Clean

- **Path traversal protection** (`local.ts:222-229`): `validateKey` checks for `..` and absolute paths. Applied consistently in `put`, `get`, `delete`, and `exists`.
- **`validateKey` error code `PUT_FAILED`**: Confirmed — line 224 and 227 both use `"PUT_FAILED"`. The report correctly notes this is misleading but not a security issue.
- **`userId` not validated for path traversal**: Confirmed — `userId` comes from `ctx.user.id` (Better Auth), not user-controllable input.
- **S3 key construction** (`s3.ts:156-158`): S3 keys have no directory traversal semantics — `..` in an S3 key is just part of the key name.
- **`calculateUsage` includes directories**: Confirmed — `readdir({ recursive: true })` returns directory entries too, slightly inflating usage. Negligible for this use case.
