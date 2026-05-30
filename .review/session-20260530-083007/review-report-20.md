# Review Report — Cluster 20: Attachment Router (Security Focus)

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Files Reviewed**:
- `packages/api/src/routers/attachment/index.ts`
- `packages/api/src/routers/attachment/schemas.ts`
- `packages/api/src/routers/attachment/upload.ts`
- `packages/api/src/routers/attachment/download.ts`
- `packages/api/src/routers/attachment/delete.ts`
- `packages/api/src/routers/attachment/read.ts`
- `packages/api/src/routers/attachment/list.ts`

**Supporting files examined**: `packages/storage/src/local.ts`, `packages/storage/src/s3.ts`, `packages/storage/src/types.ts`, `packages/storage/src/storage.ts`, `packages/domain/src/attachment.ts`, `packages/db/src/schema/crm.ts`

---

## Summary

The attachment router is generally well-structured with proper user-scoped access control on all operations. All queries correctly filter by `ctx.user.id`, preventing cross-user data access. The storage backend applies `validateKey()` to reject `..` path traversal and absolute paths. However, there are several security-relevant gaps: no MIME type allowlist, no file extension validation, `fileName` and `entityId` are not sanitized before path construction, the upload mutation does not verify that the referenced entity actually belongs to the user, and `createStorage` is instantiated on every request instead of being reused.

---

### [SEVERITY: HIGH] Finding 1: No MIME type validation — arbitrary file type upload allowed

**File**: `packages/api/src/routers/attachment/schemas.ts:12`
**Problem**: The `mimeType` field accepts any non-empty string (`z.string().min(1)`). There is no allowlist of permitted MIME types anywhere in the upload pipeline. A user can upload any file type — including `.html`, `.svg` (which can contain JavaScript), `.exe`, or claim a benign MIME type like `image/png` for a malicious payload.

**Evidence**:
```ts
// schemas.ts:12
mimeType: z.string().min(1),
```
No further validation exists in `upload.ts` — the `mimeType` value is stored verbatim and returned on download without any server-side verification against the actual file content.

**Impact**: Stored XSS via SVG/HTML uploads if the download endpoint serves files inline rather than as attachments. Executable upload could facilitate malware distribution. Claiming a false MIME type could bypass content-type-based security controls downstream.

**Suggestion**: Add a MIME type allowlist to the schema or upload handler:
```ts
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.*",
  // etc.
] as const;

mimeType: z.enum(ALLOWED_MIME_TYPES),
```
Additionally, the download endpoint should always serve files with `Content-Disposition: attachment` to prevent inline rendering.

---

### [SEVERITY: HIGH] Finding 2: Upload does not verify entity ownership — orphaned/fake attachments possible

**File**: `packages/api/src/routers/attachment/upload.ts:18`
**Problem**: The upload mutation accepts any `entityType` and `entityId` combination without verifying that the referenced entity actually exists and belongs to the authenticated user. A user can create attachments linked to:
- Non-existent entities (orphaned data)
- Entities that belong to another user (though this is a single-user CRM, the data integrity concern remains)

**Evidence**:
```ts
// upload.ts:18-37
.mutation(async ({ ctx, input }) => {
    const id = nanoid();
    const storageKey = `${input.entityType}/${input.entityId}/${id}/${input.fileName}`;
    // ... directly inserts without checking if entity exists or belongs to user
    await db.insert(attachments).values(row);
```

**Impact**: Phantom attachments that reference non-existent entities pollute the database and storage. In a multi-user scenario (even accidental), this could create referential integrity violations. Storage quota could be abused by creating attachments for non-existent entities.

**Suggestion**: Add an ownership check before inserting. Since `entityType` is an enum, dispatch to the appropriate table:
```ts
// Verify the entity exists and belongs to the user
const entityTable = getEntityTable(input.entityType); // map to clients/leads/etc.
const [entity] = await db.select({ id: entityTable.id })
  .from(entityTable)
  .where(and(eq(entityTable.id, input.entityId), eq(entityTable.userId, ctx.user.id)))
  .limit(1);
if (!entity) throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
```

---

### [SEVERITY: HIGH] Finding 3: `fileName` not sanitized — potential path traversal through storageKey construction

**File**: `packages/api/src/routers/attachment/upload.ts:20`
**Problem**: The `fileName` from user input is interpolated directly into the `storageKey` without sanitization. While `localStorage.validateKey()` checks for `..` segments, a fileName containing `..` will fail at storage time — but the database row has already been committed by that point. More critically, file names containing characters like `/`, null bytes (`\0`), or Unicode confusables could cause unexpected behavior in different storage backends.

**Evidence**:
```ts
// upload.ts:20
const storageKey = `${input.entityType}/${input.entityId}/${id}/${input.fileName}`;
```

The schema only requires `z.string().min(1)` — a fileName of `"../../etc/passwd"` or `"file\0.exe"` passes validation.

```ts
// schemas.ts:10
fileName: z.string().min(1),
```

The `validateKey` in storage checks for `..` but only runs when the storage `put` is called — and in the current upload flow, the actual file bytes are NOT uploaded through this mutation (the comment says "caller receives a `storageKey` and writes the actual bytes through a companion upload endpoint"). So `validateKey` may not even be called during this mutation.

**Impact**: A malicious `fileName` is persisted in the database and used as the `filePath` for later `download`/`delete` operations. When a download is attempted, `backend.get(ctx.user.id, row.filePath)` calls `validateKey()` — which would throw, making the file permanently inaccessible (denial of service on that attachment). But the database row still exists as a phantom record.

**Suggestion**: Sanitize `fileName` at the schema level:
```ts
fileName: z.string()
  .min(1)
  .max(255)
  .regex(/^[^/\\:*?"<>|\0]+$/, "File name contains invalid characters"),
```

---

### [SEVERITY: MEDIUM] Finding 4: `createStorage` instantiated on every request — potential resource leak and inconsistent configuration

**File**: `packages/api/src/routers/attachment/download.ts:33-41` and `packages/api/src/routers/attachment/delete.ts:34-42`
**Problem**: `createStorage()` is called fresh on every download and delete request, reading from `process.env` each time. This means:
1. Every request creates a new storage backend instance (S3 client, filesystem handles)
2. Environment variable changes take effect mid-request without restart — inconsistent behavior
3. For S3, each request triggers a lazy S3 client initialization on first use, then discards it

**Evidence**:
```ts
// download.ts:33-41
const backend = createStorage({
  STORAGE_TYPE: (process.env.STORAGE_TYPE as "local" | "s3") ?? "local",
  LOCAL_BASE_DIR: process.env.LOCAL_UPLOAD_DIR,
  S3_BUCKET: process.env.S3_BUCKET,
  // ...
});
```
Same pattern repeated in `delete.ts:34-42`.

**Impact**: Performance degradation under load. S3 client connections are re-established on every request. Environment variable reads are not validated through the `@DCRM/env` package, so typos in env var names silently fallback to defaults.

**Suggestion**: Create a singleton storage instance (or a lazy-initialized module-level singleton) that reads from the validated `@DCRM/env` configuration:
```ts
// packages/storage/src/index.ts or a shared module
let _instance: StorageBackend | null = null;
export function getStorage(): StorageBackend {
  if (!_instance) {
    _instance = createStorage({
      STORAGE_TYPE: env.STORAGE_TYPE,
      // use validated env values
    });
  }
  return _instance;
}
```

---

### [SEVERITY: MEDIUM] Finding 5: Storage env vars bypass `@DCRM/env` validation

**File**: `packages/api/src/routers/attachment/download.ts:34-41` and `packages/api/src/routers/attachment/delete.ts:35-42`
**Problem**: Storage configuration is read directly from `process.env` with unsafe type assertions (`as "local" | "s3"`) instead of using the project's `@DCRM/env` package for validated environment variables. If `STORAGE_TYPE` is set to an invalid value (e.g., `"azure"`), the `as` assertion suppresses the type error and the `createStorage` factory silently falls through to local storage.

**Evidence**:
```ts
STORAGE_TYPE: (process.env.STORAGE_TYPE as "local" | "s3") ?? "local",
```

The `as` cast is a lie — it forces the TypeScript compiler to accept any runtime value.

**Impact**: Misconfigured storage silently defaults to local storage, potentially writing files to an unexpected location. Credentials (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) are read from raw `process.env` without validation.

**Suggestion**: Move storage env vars to `@DCRM/env` validation using Zod schemas, similar to other environment variables in the project:
```ts
// packages/env/src/index.ts
STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),
LOCAL_UPLOAD_DIR: z.string().optional(),
S3_BUCKET: z.string().optional(),
// etc.
```

---

### [SEVERITY: MEDIUM] Finding 6: Delete operation is not atomic — storage file deleted before DB row, leaving orphaned DB record on failure

**File**: `packages/api/src/routers/attachment/delete.ts:44-52`
**Problem**: The delete operation first removes the file from storage (`backend.delete`), then deletes the database row. If the DB delete fails (e.g., connection error, constraint violation), the storage file is gone but the DB row persists — pointing to a non-existent file. Users would get a `NOT_FOUND` error when trying to download or re-delete, but the phantom record remains visible in listings.

**Evidence**:
```ts
// delete.ts:44-52
await backend.delete(ctx.user.id, row.filePath);   // Step 1: remove file
await db                                               // Step 2: remove row
  .delete(attachments)
  .where(
    and(
      eq(attachments.id, input.id),
      eq(attachments.userId, ctx.user.id),
    ),
  );
```

No try/catch wraps this to handle partial failures.

**Impact**: Phantom attachment records that reference deleted storage files. Users see attachments in lists that fail on download with "file not found" errors.

**Suggestion**: Either reverse the order (delete DB first, then storage), or wrap in a try/catch with compensation:
```ts
// Option A: Delete DB first (easier to recover from)
await db.delete(attachments).where(...);
try {
  await backend.delete(ctx.user.id, row.filePath);
} catch {
  // File already gone or storage error — log but don't fail
  // The DB row is deleted which is the authoritative record
}
```
Or use a database transaction with a compensating action on storage failure.

---

### [SEVERITY: MEDIUM] Finding 7: Upload records metadata before actual file bytes exist — phantom attachment records

**File**: `packages/api/src/routers/attachment/upload.ts:37`
**Problem**: The upload mutation inserts the DB record and returns the `storageKey` immediately, but the actual file bytes are uploaded separately via a "companion upload endpoint" (per the JSDoc comment). If the caller never uploads the actual bytes (network failure, client crash, malicious actor), the DB has a phantom record pointing to a non-existent storage file. The file size and MIME type are entirely client-declared with no server-side verification.

**Evidence**:
```ts
// upload.ts:9-14 (comment)
* Records attachment metadata in the database. The caller receives a
* `storageKey` and writes the actual bytes through a companion upload
* endpoint that streams directly to the storage backend.

// upload.ts:37 — row inserted before file exists
await db.insert(attachments).values(row);
```

**Impact**: Phantom records with user-declared file sizes and MIME types accumulate in the database. Storage quota tracking could be manipulated by declaring large file sizes without ever uploading. Listings show attachments that fail on download.

**Suggestion**: Either:
1. Combine metadata recording and file upload into a single atomic operation
2. Add a TTL/garbage collection mechanism for pending uploads (e.g., a `status: "pending" | "uploaded"` column with a cleanup job)
3. Verify file existence in storage before allowing the record to appear in listings

---

### [SEVERITY: MEDIUM] Finding 8: `fileSize` in DB schema is nullable — inconsistent with schema validation

**File**: `packages/db/src/schema/crm.ts:302` and `packages/api/src/routers/attachment/schemas.ts:11`
**Problem**: The schema requires `fileSize` to be a positive integer (`z.number().int().min(1).max(MAX_FILE_SIZE)`), but the database column `fileSize` is defined as `integer("file_size")` without `.notNull()`. This means the DB allows `null` file sizes, creating an inconsistency between API contract and data integrity.

**Evidence**:
```ts
// schemas.ts:11
fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),

// crm.ts:302
fileSize: integer("file_size"),  // nullable!
```

**Impact**: Direct DB writes (migrations, other code paths) could insert records with null file sizes that would fail schema validation when read back through the API.

**Suggestion**: Add `.notNull()` to the DB column definition to match the API contract:
```ts
fileSize: integer("file_size").notNull(),
```

---

## Findings Summary

| # | Severity | Title |
|---|----------|-------|
| 1 | HIGH | No MIME type validation — arbitrary file type upload allowed |
| 2 | HIGH | Upload does not verify entity ownership — orphaned/fake attachments |
| 3 | HIGH | `fileName` not sanitized — potential path traversal/DoS through storageKey |
| 4 | MEDIUM | `createStorage` instantiated on every request — resource waste |
| 5 | MEDIUM | Storage env vars bypass `@DCRM/env` validation with unsafe type assertion |
| 6 | MEDIUM | Delete not atomic — orphaned DB records on storage-then-DB failure |
| 7 | MEDIUM | Upload records metadata before actual file exists — phantom records |
| 8 | MEDIUM | `fileSize` DB column nullable despite required API schema |
