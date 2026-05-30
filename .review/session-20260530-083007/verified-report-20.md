# Verified Report — Cluster 20: Attachment Router (Security Focus)

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-20.md`

---

## Verification Summary

| # | Severity | Title | Verdict |
|---|----------|-------|---------|
| 1 | HIGH | No MIME type validation | ✅ **CONFIRMED** — severity adjusted to MEDIUM |
| 2 | HIGH | Upload does not verify entity ownership | ✅ **CONFIRMED** |
| 3 | HIGH | `fileName` not sanitized — path traversal/DoS via storageKey | ✅ **CONFIRMED** — severity adjusted to MEDIUM |
| 4 | MEDIUM | `createStorage` instantiated on every request | ✅ **CONFIRMED** |
| 5 | MEDIUM | Storage env vars bypass `@DCRM/env` validation | ✅ **CONFIRMED** |
| 6 | MEDIUM | Delete not atomic — storage-then-DB ordering | ✅ **CONFIRMED** |
| 7 | MEDIUM | Upload records metadata before actual file bytes exist | ✅ **CONFIRMED** — intentional design, severity adjusted to LOW |
| 8 | MEDIUM | `fileSize` DB column nullable vs required API schema | ✅ **CONFIRMED** |

---

### Finding 1: No MIME type validation — arbitrary file type upload allowed

**Verdict**: ✅ **CONFIRMED** — severity adjusted from HIGH to **MEDIUM**

**Evidence from source**:

- **`schemas.ts:12`**: `mimeType: z.string().min(1)` — accepts any non-empty string.
- **`upload.ts:31`**: `mimeType: input.mimeType` — stored verbatim, no server-side verification.
- **DB schema** (`crm.ts:303`): `mimeType: text("mime_type")` — also nullable in DB despite being required by API schema.

The report's evidence is **exactly accurate**. No MIME type allowlist exists anywhere in the upload pipeline.

**Severity adjustment rationale**: The product is a **single-user CRM**. The user uploads their own files to their own workspace. The MIME type is metadata stored in the DB — it is not used for content-type headers in the download endpoint (the download endpoint returns the stored data with `mimeType` from the row, but this is served through a tRPC query, not as a direct HTTP response with browser-rendered content). There is no direct inline rendering risk. The practical impact is low for a single-user context.

**CONFIRMED at MEDIUM severity.**

---

### Finding 2: Upload does not verify entity ownership — orphaned/fake attachments possible

**Verdict**: ✅ **CONFIRMED** — HIGH

**Evidence from source** (`packages/api/src/routers/attachment/upload.ts:16-37`):

```ts
export const uploadAttachment = protectedProcedure
  .input(uploadAttachmentSchema)
  .mutation(async ({ ctx, input }) => {
    const id = nanoid();
    const storageKey = `${input.entityType}/${input.entityId}/${id}/${input.fileName}`;
    // ... no entity existence or ownership check
    await db.insert(attachments).values(row);
```

The `entityType` IS validated against `attachmentEntityTypeSchema` from `@DCRM/domain` (confirmed at `schemas.ts:8`), restricting entity types to a known enum. But there is **no check** that `entityId` references an actual entity owned by the user.

The report's evidence is **exactly accurate**. Compare with `project/create.ts` which validates `clientId` ownership before creating the project, and `ticket/create.ts` which validates `projectId` ownership. The attachment upload should follow the same pattern.

**CONFIRMED at original HIGH severity.**

---

### Finding 3: `fileName` not sanitized — potential path traversal/DoS through storageKey construction

**Verdict**: ✅ **CONFIRMED** — severity adjusted from HIGH to **MEDIUM**

**Evidence from source**:

1. **`upload.ts:20`**: `const storageKey = \`${input.entityType}/${input.entityId}/${id}/${input.fileName}\``
2. **`schemas.ts:10`**: `fileName: z.string().min(1)` — only validates non-empty.
3. **`local.ts:222-228`**: `validateKey()` checks for `..` and absolute paths, but only runs during `put()`, `get()`, `delete()` — NOT during the upload mutation which only creates a DB row.

The report's analysis is **accurate**: the upload mutation only inserts a DB record. The `storageKey` is constructed from unsanitized `fileName` and persisted as `filePath` in the DB. When download/delete later calls `backend.get()` or `backend.delete()`, `validateKey()` IS invoked on `row.filePath`. A `fileName` containing `..` would pass the upload mutation but fail on download/delete with a `StorageError`.

**Severity adjustment rationale**: In a single-user CRM:
- The `validateKey()` guard in the storage backend prevents actual path traversal
- The worst case is self-DoS: the user creates an attachment they can't download
- The `entityType` segment in the storageKey is validated against the domain schema, providing partial structure

The report's claim that "the actual file bytes are NOT uploaded through this mutation" is **correct** — the JSDoc at `upload.ts:9-14` confirms the two-phase design. The `validateKey` function is never called during this mutation.

**CONFIRMED at MEDIUM severity.** The suggested regex validation in the schema (`z.string().regex(/^[^/\\:*?"<>|\0]+$/)`) is a good defense-in-depth measure.

---

### Finding 4: `createStorage` instantiated on every request — potential resource leak

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source**:

- **`download.ts:33-41`**: `const backend = createStorage({...})` — new instance per download request.
- **`delete.ts:34-42`**: `const backend = createStorage({...})` — new instance per delete request.

Both read from `process.env` each time, using unsafe type assertions (`as "local" | "s3"`). The `createStorage` factory (`storage.ts:32`) creates a new `LocalStorageBackend` or `S3StorageBackend` instance each time, reading config from env vars.

For S3, the lazy client pattern (`s3.ts:168-179`) mitigates the actual S3 connection overhead somewhat — the real AWS SDK client is built on first use and cached within the `S3StorageBackend` instance. But the instance itself is discarded after each request.

**CONFIRMED at original severity.**

---

### Finding 5: Storage env vars bypass `@DCRM/env` validation with unsafe type assertion

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source** (`download.ts:34`, `delete.ts:35`):

```ts
STORAGE_TYPE: (process.env.STORAGE_TYPE as "local" | "s3") ?? "local",
```

The `as "local" | "s3"` type assertion is unsafe — it forces TypeScript to accept any runtime value. If `STORAGE_TYPE` is set to `"azure"` or any typo, the assertion suppresses the type error and `createStorage` silently falls through to the local backend (since the `if (config.STORAGE_TYPE === "s3")` check at `storage.ts:35` fails).

The report's evidence is **exactly accurate**. All storage-related env vars (`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, etc.) bypass the project's validated `@DCRM/env` package.

**CONFIRMED at original severity.**

---

### Finding 6: Delete operation is not atomic — storage file deleted before DB row

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source** (`delete.ts:44-52`):

```ts
await backend.delete(ctx.user.id, row.filePath);  // Step 1: remove file
await db                                           // Step 2: remove row
  .delete(attachments)
  .where(and(
    eq(attachments.id, input.id),
    eq(attachments.userId, ctx.user.id),
  ));
```

No try/catch wraps this. If the DB delete fails after the storage file is deleted, the DB row persists pointing to a non-existent file. The report's analysis is **accurate**.

The suggested fix (reverse the order: delete DB first, then storage) is sound and simpler to implement than a compensating transaction.

**CONFIRMED at original severity.**

---

### Finding 7: Upload records metadata before actual file bytes exist — phantom attachment records

**Verdict**: ✅ **CONFIRMED** — severity adjusted from MEDIUM to **LOW** (intentional design)

**Evidence from source** (`upload.ts:9-14`):

```ts
/**
 * Records attachment metadata in the database. The caller receives a
 * `storageKey` and writes the actual bytes through a companion upload
 * endpoint that streams directly to the storage backend.
 */
```

**Line 37**: `await db.insert(attachments).values(row);` — DB row created before file bytes exist.

The report accurately describes this as a two-phase upload pattern. However, this is an **intentional architectural choice** documented in the JSDoc. The two-phase design allows the companion upload endpoint to stream large files directly to storage without buffering through the tRPC layer, while the metadata mutation remains lightweight.

The phantom record concern is valid — if the caller never uploads bytes, a phantom DB row persists. This is a trade-off accepted by the design.

**CONFIRMED at LOW severity.** The suggested `status: "pending" | "uploaded"` column with a cleanup job is a reasonable enhancement but not urgent for a single-user CRM.

---

### Finding 8: `fileSize` DB column nullable despite required API schema

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source**:

- **`crm.ts:302`**: `fileSize: integer("file_size")` — no `.notNull()`.
- **`schemas.ts:11`**: `fileSize: z.number().int().min(1).max(MAX_FILE_SIZE)` — required, must be ≥ 1.

The DB allows `null` for `fileSize`, but the API schema requires a positive integer. Direct DB writes (migrations, other code paths) could insert records with `null` file sizes that fail when read through the API.

Note: The same inconsistency exists for `mimeType`:
- **`crm.ts:303`**: `mimeType: text("mime_type")` — no `.notNull()`.
- **`schemas.ts:12`**: `mimeType: z.string().min(1)` — required.

**CONFIRMED at original severity.** Both `fileSize` and `mimeType` should have `.notNull()` in the DB schema to match the API contract.
