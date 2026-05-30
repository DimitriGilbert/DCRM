# Code Review Report — Cluster 9: Storage Package

**Reviewer**: Code Reviewer (Security Focus)
**Date**: 2026-05-30
**Files Reviewed**:
- `packages/storage/src/types.ts`
- `packages/storage/src/storage.ts`
- `packages/storage/src/local.ts`
- `packages/storage/src/s3.ts`
- `packages/storage/src/index.ts`
- `packages/storage/__tests__/storage.test.ts`

---

## Summary

The storage package implements a clean, well-structured abstraction over local filesystem and S3 backends. The code is intentionally designed — path traversal protection on `key`, per-user path partitioning, lazy S3 client loading, injectable test dependencies. Most of the code is solid.

I found **two real issues**: one API contract violation where S3 accepts but never enforces quota configuration, and one data integrity race condition in the local backend's quota check.

---

### [SEVERITY: MEDIUM] Finding 1: S3 backend accepts quota config but never enforces it

**File**: `packages/storage/src/s3.ts:85-109`
**Problem**: The `S3StorageBackend` constructor accepts `userQuota` via options and stores it in `limits`. The `getLimits()` method returns this value to callers, making it appear that a quota is in effect. However, the `put()` method never checks the quota — it only validates `maxFileSize`. An operator configuring S3 with a per-user quota (e.g., `USER_QUOTA=500MB` via `StorageConfig`) would see the quota reported by `getLimits()` but uploads would never be rejected for exceeding it, allowing unbounded storage growth.

**Evidence**:
```typescript
// s3.ts:71-72 — quota is stored
constructor(options: S3StorageOptions) {
    this.limits = { maxFileSize: options.maxSize, userQuota: options.userQuota };
}

// s3.ts:85-109 — put() only checks maxFileSize, never checks quota
async put(userId: string, key: string, data: Uint8Array, mimeType: string): Promise<StoredFile> {
    if (data.byteLength > this.limits.maxFileSize) {
      throw new StorageError(..., "FILE_TOO_LARGE");
    }
    // ← No quota check here. Compare with local.ts:152-160 which does check.
    const s3Key = this.s3Key(userId, key);
    ...
}

// s3.ts:81-83 — getLimits reports the configured quota
getLimits(): StorageLimits {
    return { ...this.limits };
}
```

Compare with `local.ts:152-160` which correctly enforces quota:
```typescript
if (this.limits.userQuota !== null) {
    const currentUsage = await this.calculateUsage(userId);
    if (currentUsage + data.byteLength > this.limits.userQuota) {
      throw new StorageError(..., "QUOTA_EXCEEDED");
    }
}
```

**Impact**: If an operator configures `USER_QUOTA` for the S3 backend expecting enforcement, a single user could store unlimited data in S3, incurring unbounded costs. The `getLimits()` method would also mislead any UI or middleware that displays or relies on quota information.

**Suggestion**: Either implement quota enforcement in `S3StorageBackend.put()` (requires listing objects by prefix and summing sizes, similar to the local backend's `calculateUsage`), or explicitly reject non-null `userQuota` values in the constructor and always report `null`:

```typescript
// Option A: Reject misconfiguration early
constructor(options: S3StorageOptions) {
    if (options.userQuota !== null) {
      throw new Error("S3StorageBackend does not support userQuota. Use null for unlimited.");
    }
    this.limits = { maxFileSize: options.maxSize, userQuota: null };
}
```

Or implement it using S3's `ListObjectsV2Command` with a prefix of `${userId}/` to sum existing usage before allowing the upload.

---

### [SEVERITY: MEDIUM] Finding 2: TOCTOU race condition in local backend quota enforcement

**File**: `packages/storage/src/local.ts:152-165`
**Problem**: The quota check in `LocalStorageBackend.put()` is not atomic. Usage is calculated, checked against the quota, and then the file is written in a separate async step. Two concurrent uploads for the same user can both pass the quota check before either write completes, allowing the combined size to exceed the configured quota.

**Evidence**:
```typescript
// local.ts:152-165
if (this.limits.userQuota !== null) {
    const currentUsage = await this.calculateUsage(userId);    // ← Step 1: read
    if (currentUsage + data.byteLength > this.limits.userQuota) { // ← Step 2: check
      throw new StorageError(..., "QUOTA_EXCEEDED");
    }
}

const fullPath = this.resolvePath(userId, key);

try {
    await this.fsOps.put(fullPath, data);  // ← Step 3: write (no lock between check and write)
}
```

Timeline of the race:
```
Upload A: calculateUsage → 6MB (quota 10MB) → passes check (6+5 ≤ 10) → ...
Upload B: calculateUsage → 6MB (quota 10MB) → passes check (6+5 ≤ 10) → ...
Upload A: ... write 5MB → total now 11MB (exceeds quota)
Upload B: ... write 5MB → total now 16MB (far exceeds quota)
```

**Impact**: Under concurrent uploads (e.g., browser retry, multiple tabs, programmatic batch upload), the per-user quota can be exceeded. For a single-user CRM this risk is low in practice, but the quota enforcement is the explicit security contract of this module — it should work correctly.

**Suggestion**: For the local backend, use a per-user mutex/lock around the check-then-write sequence:

```typescript
import { Mutex } from "async-mutex"; // or a simple Map<userId, Promise> queue

private readonly userLocks = new Map<string, Mutex>();

private async withUserLock<R>(userId: string, fn: () => Promise<R>): Promise<R> {
    let lock = this.userLocks.get(userId);
    if (!lock) {
      lock = new Mutex();
      this.userLocks.set(userId, lock);
    }
    return lock.runExclusive(fn);
}

// In put():
return this.withUserLock(userId, async () => {
    // quota check + write happen atomically per user
    ...
});
```

Alternatively, accept the trade-off and document it explicitly:
```typescript
// NOTE: Quota enforcement is best-effort and subject to TOCTOU under concurrent
// uploads. For strict enforcement, use S3 with bucket policies.
```

---

## Items Considered and Dismissed

The following were analyzed but are **not flagged** as issues:

- **`validateKey` error code is `"PUT_FAILED"` when called from `get`/`delete`**: The error code is misleading (a path traversal on a GET throws `PUT_FAILED`), but there is no `"INVALID_KEY"` error code in the union, and the error message is accurate. Low-impact usability issue, not a security or data integrity problem.

- **`userId` not validated for path traversal in local backend**: The `userId` always comes from `ctx.user.id` (Better Auth session), which generates UUIDs/CUIDs — never user-controllable. The class's public API surface is internal to the tRPC layer. Defense-in-depth improvement, not an exploitable vulnerability.

- **S3 backend doesn't validate `key`**: S3 keys are flat strings in a namespace. `..` and `/` in S3 keys have no traversal semantics. No vulnerability.

- **`fileName` in upload schema has no sanitization for `..`**: The constructed `storageKey` flows into `validateKey()` which catches `..`. The validation happens at the storage layer where it belongs.

- **`readdir` includes directory entries in usage calculation**: `calculateUsage` uses `readdir({ recursive: true })` which returns directories too. `stat()` on a directory returns ~4096 bytes, slightly inflating quota. Negligible for a single-user CRM.
