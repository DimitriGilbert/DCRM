# Code Review Report — Cluster 15: Client Router

**Reviewer**: Code Review Expert (Cluster 15)
**Date**: 2026-05-30
**Files Reviewed**: 12 files in `packages/api/src/routers/client/`

## Summary

Reviewed the full client CRUD router: create, read, update, soft-delete, restore, list (paginated), and search — plus schemas and test infrastructure.

**Overall assessment**: The module is well-structured. All procedures use `protectedProcedure` and correctly scope every DB query by `ctx.user.id`. The soft-delete/restore lifecycle is internally consistent. Auth enforcement is solid — `protectedProcedure` middleware throws `TRPCError(UNAUTHORIZED)` before any handler runs when `ctx.user` is null.

Three issues found, detailed below.

---

### [SEVERITY: HIGH] Finding 1: Cursor-based pagination silently drops items with identical `createdAt` timestamps

**File**: `packages/api/src/routers/client/list.ts:17-18,55-57`
**Problem**: The cursor is the `createdAt` timestamp of the last item on the current page. The next-page query uses `WHERE createdAt < cursor`. If two or more clients share the exact same `createdAt` value, items after the page boundary with that timestamp are permanently skipped — they are never returned on any page.

**Evidence**:
```ts
// line 17-18 — cursor filter
if (input.cursor) {
  conditions.push(lt(clients.createdAt, new Date(input.cursor)));
}

// line 55-57 — nextCursor is the last item's createdAt
const nextCursor = hasMore
  ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
  : undefined;
```

**Impact**: Clients with identical timestamps silently disappear from the paginated list. This can happen during batch imports, automated sync, or any rapid sequential inserts that resolve to the same millisecond in JavaScript's `Date`. In a CRM, a missing client from the list view means the user cannot find or interact with that client through normal browsing — a data-integrity-affecting UX bug.

**Scenario**: Items A (t=5), B (t=4), C (t=4), D (t=4), E (t=3). Page 1 (limit=2) returns A, B. nextCursor = t=4. Page 2 queries `WHERE createdAt < t=4` → only E. Clients C and D are never returned.

**Suggestion**: Use a composite cursor on `(createdAt, id)` to guarantee stable ordering:
```ts
// Instead of just lt(createdAt), use:
if (input.cursor) {
  const cursorDate = new Date(input.cursor);
  conditions.push(
    or(
      lt(clients.createdAt, cursorDate),
      and(
        eq(clients.createdAt, cursorDate),
        lt(clients.id, input.cursorId), // pass both cursor date and cursor id
      ),
    ),
  );
}
// Also add id as secondary sort:
.orderBy(desc(clients.createdAt), desc(clients.id))
```
Encode the cursor as a JSON string `{ createdAt, id }` or a compound string so both values travel together.

---

### [SEVERITY: MEDIUM] Finding 2: `update` procedure allows modifying soft-deleted clients

**File**: `packages/api/src/routers/client/update.ts:14-23`
**Problem**: The ownership check filters by `id` and `userId` but does **not** check `deletedAt`. This means a soft-deleted client (one that appears in the "trash" or is excluded from list/search) can still be updated — changing its name, email, or any other field — without restoring it first.

**Evidence**:
```ts
// update.ts lines 14-23 — only checks id + userId
const [existing] = await db
  .select()
  .from(clients)
  .where(
    and(
      eq(clients.id, id),
      eq(clients.userId, ctx.user.id),
    ),
  )
  .limit(1);
```

Compare with `soft-delete.ts` which correctly adds `isNull(clients.deletedAt)` and `restore.ts` which adds `isNotNull(clients.deletedAt)`.

**Impact**: A user can edit a "deleted" client's data while it's in the trash. This violates the expected lifecycle: deleted items should be inert until restored. At best it's confusing; at worst it means stale/trashed data gets silently modified, which could cascade into related entities (exchanges, projects) that reference this client.

**Suggestion**: Add the `isNull(clients.deletedAt)` filter to the ownership check in `update.ts`:
```ts
const [existing] = await db
  .select()
  .from(clients)
  .where(
    and(
      eq(clients.id, id),
      eq(clients.userId, ctx.user.id),
      isNull(clients.deletedAt),
    ),
  )
  .limit(1);
```

---

### [SEVERITY: MEDIUM] Finding 3: `dateFrom` / `dateTo` in list schema accept arbitrary strings without date validation

**File**: `packages/api/src/routers/client/schemas.ts:43-44`
**Problem**: The `dateFrom` and `dateTo` fields are `z.string().optional()`. In `list.ts`, these are passed directly to `new Date(input.dateFrom)` / `new Date(input.dateTo)`. Invalid date strings produce `Invalid Date` objects (timestamp `NaN`), which propagate into the Drizzle query as invalid SQL parameters. The resulting behavior is unpredictable — it could return zero results, throw a database error, or silently ignore the filter depending on the PostgreSQL driver version.

**Evidence**:
```ts
// schemas.ts line 43-44
dateFrom: z.string().optional(),
dateTo: z.string().optional(),

// list.ts line 22-27 — raw string passed to Date constructor
if (input.dateFrom) {
  conditions.push(gte(clients.createdAt, new Date(input.dateFrom)));
}
if (input.dateTo) {
  conditions.push(lte(clients.createdAt, new Date(input.dateTo)));
}
```

**Impact**: A malformed date string (e.g., `"yesterday"`, `"not-a-date"`) silently produces `Invalid Date`, causing the query to either return an empty result set or throw an unexpected runtime error. The user gets no clear feedback about what went wrong.

**Suggestion**: Validate date strings in the schema with a Zod `z.string().datetime()` or a custom `z.string().transform()` that parses and validates:
```ts
dateFrom: z.string().datetime({ offset: true }).optional(),
dateTo: z.string().datetime({ offset: true }).optional(),
```
Or if you need to accept broader formats:
```ts
dateFrom: z.string().pipe(z.coerce.date()).optional(),
```
This ensures only valid date strings pass validation and produce correct `Date` objects.

---

## Items Explicitly Reviewed and Found Correct

- **userId scoping**: Every query and mutation correctly filters by `eq(clients.userId, ctx.user.id)`. No auth bypass vectors found.
- **protectedProcedure**: All 7 procedures use `protectedProcedure`, which throws before handler execution when unauthenticated.
- **soft-delete / restore lifecycle**: `softDelete` checks `isNull(deletedAt)`, `restore` checks `isNotNull(deletedAt)` — mutually exclusive and correct.
- **read.ts**: Returns both deleted and non-deleted clients. This is intentional — direct access to a specific client by ID should work regardless of deletion state (consistent with how trash views typically work).
- **search.ts**: Correctly excludes deleted clients with `isNull(clients.deletedAt)`. The `ilike` pattern `%${input.query}%` is parameterized by Drizzle — no SQL injection risk. LIKE wildcards (`%`, `_`) in user input acting as wildcards is standard search behavior.
- **create.ts**: `nanoid()` generates unique IDs. Event emission with no-op persister `{ insert: async () => {} }` is consistent across all mutations and appears intentional.
- **Tag filtering in list.ts**: The entityTags query doesn't filter by userId, but the main query's `eq(clients.userId, ctx.user.id)` ensures no cross-user data leakage. Correct.
- **Schemas**: `createClientSchema` correctly requires `name: z.string().min(1)`. `updateClientSchema` correctly uses `nullable().optional()` to distinguish "clear field" (null) from "don't change" (undefined). `listClientsSchema` defaults are sensible (`limit: 50`, `includeDeleted: false`).
