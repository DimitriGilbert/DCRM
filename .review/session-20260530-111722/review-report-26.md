# Code Review Report — Cluster 26

**Reviewer**: Automated Security + Logic Review
**Date**: 2026-05-30
**Scope**: `packages/api/src/routers/search/` and `packages/api/src/routers/attachment/`
**Focus**: Security, input validation, file upload safety, data flow integrity

---

## Findings: 3

---

### [SEVERITY: MEDIUM] Finding 1: Non-atomic attachment delete — DB row removed before storage file, no rollback on storage failure

**File**: `packages/api/src/routers/attachment/delete.ts:28-38`
**Problem**: The delete mutation removes the database row first (line 28), then attempts to delete the storage file (line 38). If the storage `delete()` call throws (e.g., transient S3 error, file already gone, permission issue), the DB record is already gone but the storage file remains as an orphan. Worse, the error propagates to the caller — they see a failure but the metadata is already deleted, making the attachment unrecoverable and undeletable through the API.

**Evidence**:
```ts
// Step 1: Delete DB record
await db
  .delete(attachments)
  .where(
    and(
      eq(attachments.id, input.id),
      eq(attachments.userId, ctx.user.id),
    ),
  );

// Step 2: Delete storage file — if this fails, DB row is already gone
const backend = getStorageBackend();
await backend.delete(ctx.user.id, row.filePath);
```

**Impact**: Orphaned storage files accumulate over time, consuming storage quota/cost. If the storage backend throws, the user receives an error but the attachment is already soft-deleted from the DB, creating an inconsistent state the user cannot resolve (can't retry delete, can't re-download).

**Suggestion**: Reverse the order — delete storage first, then DB — or wrap in a compensation pattern:
```ts
// Delete storage first — if it fails, DB record remains intact and user can retry
const backend = getStorageBackend();
await backend.delete(ctx.user.id, row.filePath);

// Then remove the DB record
await db
  .delete(attachments)
  .where(
    and(
      eq(attachments.id, input.id),
      eq(attachments.userId, ctx.user.id),
    ),
  );
```
Alternatively, use a soft-delete flag in the DB first, then clean up storage asynchronously, and finally hard-delete the DB row once storage confirms success.

---

### [SEVERITY: MEDIUM] Finding 2: `resolveEntityIdsByTags` does not scope tagIds to the requesting user — allows cross-user tag ID queries

**File**: `packages/api/src/routers/search/global.ts:49-65`
**Problem**: The `resolveEntityIdsByTags` function queries the `entityTags` table filtering only by `entityType` and `tagIds`, without joining the `tags` table to verify that the provided tagIds belong to the requesting user. The `entityTags` table has no `userId` column — the only path to user ownership is through `tags.userId` via the foreign key on `entityTags.tagId`. A user could supply tagIds belonging to another user, causing the database to resolve entity IDs from another user's tagged entities.

While the final entity-level queries (e.g., `searchClients`) enforce `eq(clients.userId, userId)`, so no actual entity data leaks, the function still:
1. Performs unnecessary database work resolving entity IDs that will never match
2. Violates defense-in-depth by processing unvalidated cross-tenant identifiers
3. Could theoretically be used as an oracle to determine whether a tagId has associated entities (by observing whether search results change timing/behavior)

**Evidence**:
```ts
async function resolveEntityIdsByTags(
  entityType: string,
  tagIds: string[],
): Promise<string[]> {
  const rows = await db
    .select({ entityId: entityTags.entityId })
    .from(entityTags)
    .where(
      and(
        eq(entityTags.entityType, entityType),
        inArray(entityTags.tagId, tagIds),
      ),
    );
  // No join to tags table to verify userId ownership
```

**Impact**: Cross-tenant database queries. In a shared PostgreSQL instance, this could allow resource consumption by forcing resolution of large tag associations belonging to other users. The defense-in-depth principle is violated, even though no entity data is exposed due to the final `userId` scoping.

**Suggestion**: Join through `tags` to enforce user ownership:
```ts
async function resolveEntityIdsByTags(
  entityType: string,
  tagIds: string[],
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ entityId: entityTags.entityId })
    .from(entityTags)
    .innerJoin(tags, eq(entityTags.tagId, tags.id))
    .where(
      and(
        eq(entityTags.entityType, entityType),
        inArray(entityTags.tagId, tagIds),
        eq(tags.userId, userId),
      ),
    );
  // ...
}
```

---

### [SEVERITY: MEDIUM] Finding 3: Upload mutation creates DB record but never stores file data — metadata-only record can never be downloaded

**File**: `packages/api/src/routers/attachment/upload.ts:39-88`
**Problem**: The upload mutation creates a database record with the attachment metadata (fileName, fileSize, mimeType, filePath) and emits a `FILE_ATTACHED` event, but never calls `backend.put()` to actually store the file data. The `uploadAttachmentSchema` input has no `data` or file content field — only metadata fields. Meanwhile, the download handler (`download.ts`) calls `backend.get(ctx.user.id, row.filePath)` which will throw `NOT_FOUND` because the file was never stored.

This creates a state where:
- The attachment appears in list/read queries (it's in the DB)
- The `FILE_ATTACHED` event fires (auditable action)
- Any download attempt fails with a storage error
- There's no mechanism in this router to actually store the file bytes

If this is intentional (e.g., the client uploads directly to storage using a presigned URL and this endpoint just records the metadata), the code lacks documentation of this contract, and there's no validation that the file actually exists in storage before confirming the attachment.

**Evidence**:
```ts
// Upload: creates metadata record, no backend.put() call
const storageKey = `${input.entityType}/${input.entityId}/${id}/${input.fileName}`;
await db.insert(attachments).values(row);
await emitEvent(..., { type: EVENT_TYPE.FILE_ATTACHED, ... });
return { ...row, storageKey };

// Download: expects the file to exist in storage
const data = await backend.get(ctx.user.id, row.filePath);
// Will throw NOT_FOUND because upload never called backend.put()
```

**Impact**: Every uploaded attachment will fail on download. The `FILE_ATTACHED` event is emitted for a file that doesn't exist in storage, creating misleading audit trail entries. If there's a separate upload mechanism, it's not visible in this router, creating a fragile coupling.

**Suggestion**: Either:
1. Add the file data as input and call `backend.put()` during upload:
```ts
const backend = getStorageBackend();
await backend.put(ctx.user.id, storageKey, input.data, input.mimeType);
```
2. Or if using a two-phase upload (metadata first, file upload separate), add a status field to track whether the file has been confirmed in storage, and validate file existence before confirming the attachment.

---

## No-Issue Observations (Reviewed, No Problems Found)

The following were explicitly checked and found to be correctly handled:

- **LIKE injection prevention**: `escapeLikeWildcards` in `search/global.ts` properly escapes `%`, `_`, and `\` before constructing the LIKE pattern. Used with Drizzle ORM parameterized queries. ✅
- **Path traversal in file names**: `schemas.ts` validates `fileName` with regex `/^[^/\\:*?"<>|\0]+$/` which blocks all path separators and null bytes. ✅
- **Entity type validation**: Both search and attachment routers use `z.enum()` schemas (`searchEntityTypeSchema`, `attachmentEntityTypeSchema`) to restrict entity types to known values. ✅
- **Authorization**: All endpoints use `protectedProcedure` with userId scoping on every database query. ✅
- **Soft-delete handling**: Search functions correctly filter `isNull(table.deletedAt)` for all entities that support soft deletion. ✅
- **File size limits**: Validated at schema level (25MB max) and enforced at storage backend level. ✅
- **Storage key validation**: The `LocalStorageBackend.validateKey()` rejects absolute paths and `..` segments as a defense-in-depth layer. ✅
- **Exchanges have no deletedAt column**: The `searchExchanges` function correctly omits the `deletedAt` filter since the `exchanges` table doesn't have this column. ✅
