# Code Review Report — Cluster 22: Search, Import & Export

**Reviewer**: Automated Deep Review
**Date**: 2026-05-30
**Files Reviewed**: 15 files across `packages/api/src/routers/{search,import,export}`

---

## Summary

Found **4 real issues**: 1 CRITICAL data integrity bug in full data export, 1 HIGH-severity partial import failure risk, and 2 MEDIUM issues (unbounded CSV input, unescaped LIKE wildcards).

---

### [SEVERITY: CRITICAL] Finding 1: Full Data Export — entityTags query uses wrong column (data never exported)

**File**: packages/api/src/routers/export/full-data-export.ts:54
**Problem**: The `entityTags` query filters by `eq(entityTags.tagId, userId)`, but `entityTags.tagId` is a foreign key to the `tags.id` column — it stores **tag IDs**, not **user IDs**. The `entityTags` table has no `userId` column at all (confirmed from `packages/db/src/schema/crm.ts:269-289`). This query will almost never return results because a user's ID will not match any tag's ID. This means **entity-tag associations are silently dropped from every full data export**.

The `.catch(() => [])` on the same line further masks the bug by swallowing any potential errors.

**Evidence**:
```typescript
// Line 54 — compares tag foreign key to user ID
db.select().from(entityTags).where(eq(entityTags.tagId, userId)).catch(() => []),
```
Schema confirmation (crm.ts:269-289):
```typescript
export const entityTags = pgTable("entity_tags", {
  id: text("id").primaryKey(),
  tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// No userId column exists
```
**Impact**: Users performing a full data export lose all tag-to-entity associations. If they rely on the export for backup/migration, their tag assignments are silently gone. The `.catch(() => [])` hides any database errors, so the export always "succeeds" with empty entity tags.

**Suggestion**: Use the already-fetched `tagsData` (line 52) to scope the query correctly:
```typescript
// After tagsData is fetched on line 52:
const userTagIds = tagsData.map((t) => t.id);
db.select().from(entityTags).where(
  userTagIds.length > 0 ? inArray(entityTags.tagId, userTagIds) : undefined
)
```
This requires importing `inArray` from `drizzle-orm`.

---

### [SEVERITY: HIGH] Finding 2: Bulk Import — No transaction wrapping; partial failures leave inconsistent state

**File**: packages/api/src/routers/import/import-clients.ts:58-108
**Problem**: Client inserts happen one-by-one in a loop without a database transaction. If any `db.insert(clients).values(clientRow)` call throws (e.g., DB connection loss, constraint violation on row 50 of 100), the procedure aborts and the already-inserted rows remain in the database. The user receives a tRPC error instead of the response object, so they don't know how many rows succeeded. Retrying the import would create duplicates of the already-inserted clients.

**Evidence**:
```typescript
// Lines 58-108: Each insert is independent, no transaction boundary
for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
  const row = rows[rowIdx];
  // ...
  await db.insert(clients).values(clientRow);  // Can throw at any iteration
  response.created++;
  await emitEvent(/* ... */);
}
```
**Impact**: A failed import mid-way creates orphaned clients in the database with no clean rollback. The user cannot determine which rows were imported and which weren't, making retry dangerous (duplicates) and manual cleanup painful.

**Suggestion**: Wrap the entire loop in a Drizzle transaction:
```typescript
await db.transaction(async (tx) => {
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    // ... validation ...
    await tx.insert(clients).values(clientRow);
    // emit event after transaction commits, or collect events to emit after
  }
});
// Emit events only after transaction commits successfully
```
Alternatively, if transactions aren't feasible for the event emissions, at minimum collect the events and emit them after the transaction commits. If the transaction rolls back, no events are emitted.

---

### [SEVERITY: MEDIUM] Finding 3: CSV Import — No input size limit on csvData (DoS vector)

**File**: packages/api/src/routers/import/schemas.ts:16
**Problem**: The `importClientsSchema` accepts `csvData: z.string().min(1)` with no upper bound. A client can send an arbitrarily large CSV string, causing the server to: (1) hold the entire string in memory, (2) parse it into a potentially huge array of rows via `parseCsv`, and (3) attempt to insert all rows sequentially into the database. This is a memory/CPU denial-of-service vector.

**Evidence**:
```typescript
// schemas.ts:16 — no max length
csvData: z.string().min(1),
```
```typescript
// import-clients.ts:37 — parses entire string, no limit check
const rows = parseCsv(input.csvData, input.hasHeader);
```
**Impact**: A malicious or buggy client can submit a multi-gigabyte CSV string, exhausting server memory or causing the request to hang for minutes. Since this is a mutation (not a query), it also causes sequential DB writes that can tie up connections.

**Suggestion**: Add a max length to the schema and a row-count sanity check:
```typescript
export const importClientsSchema = z.object({
  csvData: z.string().min(1).max(5_000_000), // ~5 MB limit
  columnMappings: z.array(columnMappingSchema).min(1),
  hasHeader: z.boolean().default(true),
});
```
Also add an early bail-out after parsing:
```typescript
const rows = parseCsv(input.csvData, input.hasHeader);
if (rows.length > 10_000) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "CSV exceeds maximum row limit of 10,000" });
}
```

---

### [SEVERITY: MEDIUM] Finding 4: Search — SQL LIKE wildcards in user input are not escaped

**File**: packages/api/src/routers/search/global.ts:295
**Problem**: User input is directly interpolated into an SQL `LIKE`/`ILIKE` pattern via `%${input.query}%`. The characters `%` and `_` are SQL LIKE wildcards — if the user searches for `%`, the pattern becomes `%%` which matches everything. A search for `_` becomes `%_%` matching any string of length ≥ 1. This breaks search relevance and can return unexpected results.

**Evidence**:
```typescript
// Line 295 — raw user query becomes LIKE pattern
const pattern = `%${input.query}%`;

// Then used in ILIKE calls:
ilike(clients.name, pattern),
ilike(clients.email, pattern),
// ... etc.
```
**Impact**: Searching for `%` or `_` returns unfiltered results (everything matches), defeating the purpose of search. While this doesn't cause a security issue (data is already scoped by userId), it produces confusing behavior and is a common pitfall.

**Suggestion**: Escape LIKE wildcards before constructing the pattern:
```typescript
function escapeLikeWildcards(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

const pattern = `%${escapeLikeWildcards(input.query)}%`;
```
Note: PostgreSQL supports `\\` as the default escape character in LIKE patterns. Verify the Drizzle ORM `ilike` function supports this (it passes through to the raw SQL, so it should work).
