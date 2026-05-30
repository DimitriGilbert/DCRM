# Verified Report — Cluster 22: Search, Import & Export

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-22.md

---

## Verification Summary

| # | Original Severity | Finding | Verdict |
|---|-------------------|---------|---------|
| 1 | CRITICAL | Full Data Export — entityTags uses wrong column | ✅ **CONFIRMED** |
| 2 | HIGH | Bulk Import — no transaction wrapping | ✅ **CONFIRMED** |
| 3 | MEDIUM | CSV Import — no input size limit | ✅ **CONFIRMED** |
| 4 | MEDIUM | Search — LIKE wildcards not escaped | ✅ **CONFIRMED** |

---

### [SEVERITY: CRITICAL] Finding 1: Full Data Export — entityTags query uses wrong column — ✅ CONFIRMED

**File**: `packages/api/src/routers/export/full-data-export.ts:54`

**Evidence Verified**:

1. **Line 54**: `db.select().from(entityTags).where(eq(entityTags.tagId, userId)).catch(() => [])` — compares `entityTags.tagId` (a FK to `tags.id`) to `userId`.
2. **DB Schema** (crm.ts:269-289): `entityTags` table has columns: `id`, `tagId`, `entityType`, `entityId`, `createdAt`. **No `userId` column exists.**
3. The `tagId` column stores references to `tags.id`, not user IDs. Unless a user's ID happens to match a tag's ID (astronomically unlikely with nanoid), this query returns zero results.
4. The `.catch(() => [])` on line 54 swallows any database errors, making the export always "succeed" with empty entity tags.

**Verdict**: CONFIRMED. This is a critical data-loss bug. Entity-tag associations are silently dropped from every full data export. The fix is straightforward: use the already-fetched `tagsData` (line 53) to get user's tag IDs, then filter `entityTags` by those IDs using `inArray()`.

---

### [SEVERITY: HIGH] Finding 2: Bulk Import — no transaction wrapping — ✅ CONFIRMED

**File**: `packages/api/src/routers/import/import-clients.ts:58-108`

**Evidence Verified**:

1. **Lines 58-108**: The for-loop calls `await db.insert(clients).values(clientRow)` on each iteration without a `db.transaction()` wrapper.
2. No transaction boundary exists anywhere in the procedure. Each insert is an independent DB operation.
3. If any insert throws (DB connection loss, constraint violation on row N), rows 1 through N-1 remain committed. The procedure aborts and throws a tRPC error.
4. The `response.created` counter tracks successful inserts, but since the error prevents the response from being returned, the user has no visibility into partial progress.

**Verdict**: CONFIRMED. Partial import failures leave orphaned rows. Retrying creates duplicates. No rollback mechanism exists.

---

### [SEVERITY: MEDIUM] Finding 3: CSV Import — no input size limit — ✅ CONFIRMED

**File**: `packages/api/src/routers/import/schemas.ts:16`

**Evidence Verified**:

1. **schemas.ts:16**: `csvData: z.string().min(1)` — no `.max()` constraint.
2. **parseCsv function** (parse-csv.ts:9-88): Iterates over entire `csvData.length` with no row-count or byte-size limit. Constructs arrays of rows in memory.
3. **import-clients.ts:37**: `const rows = parseCsv(input.csvData, input.hasHeader)` — no limit check after parsing.

**Verdict**: CONFIRMED. A client can submit an arbitrarily large CSV string. No schema-level or code-level limit exists on the input size or row count. This is a memory/CPU denial-of-service vector.

---

### [SEVERITY: MEDIUM] Finding 4: Search — SQL LIKE wildcards not escaped — ✅ CONFIRMED

**File**: `packages/api/src/routers/search/global.ts:295`

**Evidence Verified**:

1. **Line 295**: `const pattern = `%${input.query}%`` — user input is directly interpolated into the LIKE pattern with no escaping of `%` or `_` characters.
2. The `pattern` variable is passed to multiple `ilike()` calls (lines 81-84, 129-133, 178-179, 224-225, 268-269).
3. A search for `%` becomes `%%%` which matches everything. A search for `_` becomes `%_%` matching any non-empty string.

**Verdict**: CONFIRMED. This is not a security vulnerability (all data is already scoped by userId), but it produces confusing search behavior when users search for strings containing `%` or `_` characters. The suggestion to add an `escapeLikeWildcards()` utility is sound.

---

## Overall Assessment

All 4 findings in the original report are confirmed as real issues in the codebase. The most severe is Finding 1 (wrong column in export) which causes silent data loss on every full export.
