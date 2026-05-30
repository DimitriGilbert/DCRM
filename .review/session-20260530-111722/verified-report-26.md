# Verified Review Report — Cluster 26: Search + Attachment Routers

**Verification Agent**: Code Review Verification
**Date**: 2026-05-30
**Original Report**: review-report-26.md
**Verdict**: 3 CONFIRMED / 0 DISMISSED

---

### Finding 1: Non-atomic attachment delete — DB row removed before storage file, no rollback on storage failure — CONFIRMED

**Original**: The delete mutation removes the DB row first, then attempts to delete the storage file. If storage `delete()` throws, the DB record is already gone but the file remains as an orphan. The user sees an error but cannot retry or recover.

**Verification**: Actual source code at `packages/api/src/routers/attachment/delete.ts` confirms:

1. **Lines 28–35** — DB row deleted first:
   ```typescript
   await db
     .delete(attachments)
     .where(
       and(
         eq(attachments.id, input.id),
         eq(attachments.userId, ctx.user.id),
       ),
     );
   ```

2. **Lines 37–38** — Storage file deleted second:
   ```typescript
   const backend = getStorageBackend();
   await backend.delete(ctx.user.id, row.filePath);
   ```

3. **`StorageBackend.delete()` contract** (from `packages/storage/src/types.ts:62–64`):
   ```typescript
   /**
    * Delete a file.
    * @throws {StorageError} when the file does not exist.
    */
   delete(userId: string, key: string): Promise<void>;
   ```
   The interface explicitly documents that `delete()` **throws** when the file doesn't exist. This means if the file was already cleaned up externally, the DB row is deleted but the mutation still throws — the user sees a failure for an operation that actually partially succeeded.

4. **No compensation or error handling** wraps the storage delete. If it throws, the error propagates to the tRPC caller as an `INTERNAL_SERVER_ERROR`.

5. **Event emission at lines 40–52** happens AFTER the storage delete, so if storage fails, the `FILE_DETACHED` event is never emitted either — creating an audit gap.

**Verdict**: CONFIRMED. The ordering is problematic: DB-first-then-storage creates orphan risk, and the `StorageBackend.delete()` contract means even a "file already gone" scenario causes a user-facing error after the DB record is already deleted. The report's suggestion to reverse the order (storage first, then DB) is sound.

---

### Finding 2: `resolveEntityIdsByTags` does not scope tagIds to the requesting user — CONFIRMED

**Original**: The function queries `entityTags` filtering only by `entityType` and `tagIds` without joining `tags` to verify that the provided tagIds belong to the requesting user. This allows cross-tenant tag ID queries.

**Verification**: Actual source code confirms:

1. **`packages/api/src/routers/search/global.ts:49–65`** — the function:
   ```typescript
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
     const set = new Set(rows.map((r) => r.entityId));
     return [...set];
   }
   ```
   - No `userId` parameter accepted.
   - No join to `tags` table.
   - Filters only on `entityType` and `tagIds`.

2. **`packages/db/src/schema/crm.ts:269–289`** — `entityTags` table definition:
   ```typescript
   export const entityTags = pgTable("entity_tags", {
     id: text("id").primaryKey(),
     tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
     entityType: text("entity_type").notNull(),
     entityId: text("entity_id").notNull(),
     createdAt: timestamp("created_at").defaultNow().notNull(),
   });
   ```
   Confirmed: **no `userId` column** on `entityTags`. The only path to user ownership is through `tags.userId` via the `tagId` foreign key.

3. **Mitigating factor** (as the report notes): The final entity queries (`searchClients`, `searchLeads`, etc.) do enforce `eq(table.userId, userId)`, so no actual entity data leaks to the wrong user. The `resolveEntityIdsByTags` function could return entity IDs from another user's tagged entities, but those IDs would never match in the final `WHERE ... AND userId = ?` query.

**Verdict**: CONFIRMED. The function performs unvalidated cross-tenant queries. While the final entity-level `userId` scoping prevents actual data leakage, the defense-in-depth gap is real. A user supplying arbitrary tagIds causes the database to perform unnecessary work resolving entity IDs from other users' data. The report's suggestion to join through `tags` and filter by `userId` is the correct fix.

---

### Finding 3: Upload mutation creates DB record but never stores file data — metadata-only record can never be downloaded — CONFIRMED

**Original**: The upload mutation creates a DB record with attachment metadata and emits a `FILE_ATTACHED` event, but never calls `backend.put()` to store the file data. The schema has no `data` or file content field. Downloads will fail because the file was never stored.

**Verification**: Actual source code confirms:

1. **`packages/api/src/routers/attachment/upload.ts`** — full file reviewed (89 lines):
   - **No import or use of `getStorageBackend`** anywhere in the file. The only imports from `../../storage` are absent.
   - **Lines 69**: Only `db.insert(attachments).values(row)` — purely metadata.
   - **Lines 71–86**: Emits `FILE_ATTACHED` event.
   - **Lines 88**: Returns `{ ...row, storageKey }`.
   - **No `backend.put()` call exists**.

2. **`packages/api/src/routers/attachment/schemas.ts:7–13`** — upload schema:
   ```typescript
   export const uploadAttachmentSchema = z.object({
     entityType: attachmentEntityTypeSchema,
     entityId: z.string().min(1),
     fileName: z.string().min(1).regex(/^[^/\\:*?"<>|\0]+$/),
     fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
     mimeType: z.string().min(1),
   });
   ```
   No `data`, `content`, or `buffer` field — only metadata fields (`fileName`, `fileSize`, `mimeType`). There is no way for the client to send file bytes through this mutation.

3. **`packages/api/src/routers/attachment/download.ts:27–28`** — download handler:
   ```typescript
   const backend = getStorageBackend();
   const data = await backend.get(ctx.user.id, row.filePath);
   ```
   This will call `backend.get()` for a file that was never stored via `backend.put()`. According to the `StorageBackend` interface (`types.ts:53–55`), `get()` throws `StorageError` with code `NOT_FOUND` when the file doesn't exist.

4. **`StorageBackend.put()` signature** (`types.ts:40–45`):
   ```typescript
   put(userId: string, key: string, data: Uint8Array, mimeType: string): Promise<StoredFile>;
   ```
   The interface supports storing file bytes, but upload.ts never calls it.

**Verdict**: CONFIRMED. This is a genuine gap. The upload endpoint creates a metadata-only DB record with no mechanism to store actual file bytes. Every download attempt will fail with a `StorageError(NOT_FOUND)`. The `FILE_ATTACHED` event fires for a file that doesn't exist in storage. Unless there is a separate upload mechanism outside this router (e.g., presigned URL direct-to-S3 upload), this is a broken feature. Even if such a mechanism exists elsewhere, the coupling is undocumented and fragile.

---

## Verification Summary

| Finding | Title | Verdict |
|---------|-------|---------|
| 1 | Non-atomic attachment delete (DB-first ordering) | CONFIRMED |
| 2 | `resolveEntityIdsByTags` missing userId scoping | CONFIRMED |
| 3 | Upload mutation never stores file data | CONFIRMED |

**Total**: 3 CONFIRMED / 0 DISMISSED
