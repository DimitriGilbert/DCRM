# Verified Report — Cluster 21: Tags & Entity Tags

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-21.md

---

## Verification Summary

| # | Original Severity | Finding | Verdict |
|---|-------------------|---------|---------|
| 1 | CRITICAL | detach.ts skips userId ownership check | ✅ **CONFIRMED** |
| 2 | HIGH | attach.ts has no duplicate prevention | ✅ **CONFIRMED** |
| 3 | HIGH | entityType is completely unvalidated | ✅ **CONFIRMED** |

---

### [SEVERITY: CRITICAL] Finding 1: detach.ts skips userId ownership check — ✅ CONFIRMED

**File**: `packages/api/src/routers/entity-tag/detach.ts:10`

**Evidence Verified**:

1. **Line 10**: `async ({ input })` — `ctx` is not destructured. There is no way to access the authenticated user's ID.
2. **Lines 11-21**: Queries `entityTags` table directly using only `input.tagId`, `input.entityType`, `input.entityId`. No join to `tags` table, no `userId` filter.
3. **Lines 27-35**: The DELETE uses the same unscoped conditions.

**Cross-reference with attach.ts** (correct pattern):
- `attach.ts:11`: `async ({ ctx, input })` — properly destructures `ctx`
- `attach.ts:16-18`: Joins to `tags` table and filters by `ctx.user.id`

**DB Schema Confirmed**: `entity_tags` table (crm.ts:269-289) has NO `userId` column. Ownership is established only through the `tagId → tags.id` foreign key. The `tags` table has `userId`.

**Verdict**: CONFIRMED. This is a real authorization bypass. Any authenticated user can detach tags from entities by knowing the IDs. The code literally cannot check ownership because `ctx` is never accessed.

---

### [SEVERITY: HIGH] Finding 2: attach.ts has no duplicate prevention — ✅ CONFIRMED

**File**: `packages/api/src/routers/entity-tag/attach.ts:38`

**Evidence Verified**:

1. **Line 38**: `await db.insert(entityTags).values(row)` — a blind INSERT with no preceding existence check and no try/catch.
2. **DB Schema** (crm.ts:283-287): `uniqueIndex("entity_tags_unique_idx").on(table.tagId, table.entityType, table.entityId)` — a unique constraint exists.
3. No error handling wraps the insert. A duplicate attach will throw a raw PostgreSQL unique constraint violation, which tRPC surfaces as `INTERNAL_SERVER_ERROR`.

**Verdict**: CONFIRMED. The unique constraint exists at the DB level, but the API layer does not handle it gracefully. Duplicate attach requests produce 500 errors with internal DB details instead of a clean response.

---

### [SEVERITY: HIGH] Finding 3: entityType is completely unvalidated — ✅ CONFIRMED

**File**: `packages/api/src/routers/entity-tag/schemas.ts:5,13`

**Evidence Verified**:

1. **schemas.ts:5**: `entityType: z.string().min(1)` — accepts any non-empty string.
2. **Domain package** (`@DCRM/domain/attachment.ts`): exports `attachmentEntityTypeSchema = z.enum(["client", "lead", "project", "ticket", "exchange"])` but entity-tag schemas do not import or use it.
3. **DB Relations** (crm.ts:340-414):
   - `clientsRelations` (line 346): has `tags: many(entityTags)` ✓
   - `projectsRelations` (line 372): has `tags: many(entityTags)` ✓
   - `ticketsRelations` (line 386): has `tags: many(entityTags)` ✓
   - `leadsRelations` (lines 350-359): does NOT have `tags: many(entityTags)` ✗
   - `exchangesRelations` (lines 390-407): does NOT have `tags: many(entityTags)` ✗

**Verdict**: CONFIRMED. Tags can be attached with arbitrary `entityType` values like `"banana"`. Even valid entity types like `"lead"` and `"exchange"` are accepted despite not having `tags` relations in the schema, creating orphaned rows.

---

## Non-Issues (Verified Correct)

- **Cascade on tag deletion**: FK `entity_tags.tag_id → tags.id` has `onDelete: "cascade"` (crm.ts:275). Correct.
- **userId scoping on tag CRUD**: create, update, delete, list correctly scope by `ctx.user.id`. Correct.
- **Cursor-based pagination in list**: Uses `createdAt` cursor with `lt` + `desc`, fetches `limit + 1`. Correct.
