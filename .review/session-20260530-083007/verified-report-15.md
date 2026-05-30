# Verified Report — Cluster 15: Client Router

**Original Report**: `review-report-15.md`
**Verdict**: 3 findings — all **CONFIRMED**.

---

## Verification Method

Read all source files in `packages/api/src/routers/client/`:
- `schemas.ts` (54 lines, full file)
- `list.ts` (60 lines, full file)
- `update.ts` (62 lines, full file)
- `soft-delete.ts` (47 lines, full file)
- `restore.ts` (46 lines, full file)
- `read.ts` (27 lines, full file)
- `search.ts` (32 lines, full file)

---

### Finding 1: Cursor-based Pagination Drops Items with Identical `createdAt` — ✅ CONFIRMED

**Severity**: HIGH (unchanged)

**Evidence verified**:

`list.ts:17-18` — Cursor filter uses only `createdAt`:
```ts
if (input.cursor) {
  conditions.push(lt(clients.createdAt, new Date(input.cursor)));
}
```

`list.ts:50` — Ordering is by `createdAt` only, no secondary sort:
```ts
.orderBy(desc(clients.createdAt))
```

`list.ts:55-57` — Next cursor is only the timestamp:
```ts
const nextCursor = hasMore
  ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
  : undefined;
```

**Scenario from report is valid**: Items at timestamps t=5, t=4, t=4, t=4, t=3. Page 1 (limit=2) returns items at t=5 and one of the t=4 items. `nextCursor = t=4`. Page 2 queries `WHERE createdAt < t=4` → only the t=3 item. The two remaining t=4 items are permanently skipped.

**Verdict**: CONFIRMED. The cursor is a bare timestamp with no tiebreaker. Items sharing the same `createdAt` value across the page boundary are silently dropped. This can occur during batch imports, automated sync, or rapid sequential inserts. The fix (composite cursor on `(createdAt, id)`) is correct.

---

### Finding 2: `update` Procedure Allows Modifying Soft-Deleted Clients — ✅ CONFIRMED

**Severity**: MEDIUM (unchanged)

**Evidence verified**:

`update.ts:14-23` — Ownership check, no `deletedAt` filter:
```ts
const [existing] = await db
  .select()
  .from(clients)
  .where(
    and(
      eq(clients.id, id),
      eq(clients.userId, ctx.user.id),
      // NO isNull(clients.deletedAt) here
    ),
  )
  .limit(1);
```

Comparison with lifecycle-aware procedures:

`soft-delete.ts:15-21` — Correctly checks `isNull(deletedAt)`:
```ts
.where(
  and(
    eq(clients.id, input.id),
    eq(clients.userId, ctx.user.id),
    isNull(clients.deletedAt),  // ← present
  ),
)
```

`restore.ts:15-21` — Correctly checks `isNotNull(deletedAt)`:
```ts
.where(
  and(
    eq(clients.id, input.id),
    eq(clients.userId, ctx.user.id),
    isNotNull(clients.deletedAt),  // ← present
  ),
)
```

`read.ts:14-19` — Also omits `deletedAt` check (returns both deleted and non-deleted). The report notes this is intentional — direct ID access should work regardless of deletion state. This is a reasonable design choice for `read`.

However, `update` is different from `read`. Allowing edits to a soft-deleted client violates the expected lifecycle (deleted = inert until restored). The `softDelete` procedure explicitly requires `isNull(deletedAt)` to prevent double-deletion, and `restore` explicitly requires `isNotNull(deletedAt)` — but `update` has no such guard.

**Verdict**: CONFIRMED. A soft-deleted client can be updated. This is inconsistent with the soft-delete/restore lifecycle guards and could lead to confusing behavior or stale data modifications on trashed records.

---

### Finding 3: `dateFrom` / `dateTo` Accept Arbitrary Strings Without Date Validation — ✅ CONFIRMED

**Severity**: MEDIUM (unchanged)

**Evidence verified**:

`schemas.ts:43-44` — Plain `z.string()` with no date format validation:
```ts
dateFrom: z.string().optional(),
dateTo: z.string().optional(),
```

`list.ts:21-26` — Raw strings passed to `Date` constructor:
```ts
if (input.dateFrom) {
  conditions.push(gte(clients.createdAt, new Date(input.dateFrom)));
}
if (input.dateTo) {
  conditions.push(lte(clients.createdAt, new Date(input.dateTo)));
}
```

`new Date("not-a-date")` produces `Invalid Date` (timestamp `NaN`). This gets passed to Drizzle which generates a SQL parameter. PostgreSQL behavior with `NaN` timestamp comparisons is undefined — the query may return zero results, throw an error, or silently ignore the filter depending on the driver version.

**Verdict**: CONFIRMED. Invalid date strings are not caught at the Zod validation layer and produce unpredictable runtime behavior in the database query. The suggested fixes (`z.string().datetime()` or `z.string().pipe(z.coerce.date())`) are both correct.

---

## Items Verified as Correctly Reviewed

The original report's "explicitly reviewed and found correct" section is confirmed:

- **userId scoping**: Every query in all 7 files uses `eq(clients.userId, ctx.user.id)`. No cross-user data leakage.
- **protectedProcedure**: All 7 procedures (`create`, `read`, `update`, `softDelete`, `restore`, `list`, `search`) use `protectedProcedure`.
- **soft-delete/restore mutual exclusion**: `softDelete` checks `isNull(deletedAt)`, `restore` checks `isNotNull(deletedAt)`. Correct.
- **read.ts returns deleted clients**: Intentional — direct ID access works regardless of state.
- **search.ts excludes deleted**: `isNull(clients.deletedAt)` filter present. Correct.
- **ilike pattern is parameterized**: No SQL injection risk from `%${input.query}%`.
- **Tag filtering in list.ts**: The entityTags subquery doesn't filter by userId, but the main query's `eq(clients.userId, ctx.user.id)` ensures no cross-user leakage. Correct.
- **Schemas**: `createClientSchema` requires `name: z.string().min(1)`. `updateClientSchema` uses `nullable().optional()` correctly. `listClientsSchema` defaults are sensible.

---

## Summary

| Finding | Original Severity | Verdict | Notes |
|---------|------------------|---------|-------|
| F1: Cursor pagination drops items | HIGH | ✅ CONFIRMED | Real data-loss bug for identical timestamps. No tiebreaker on cursor/ordering. |
| F2: Update allows modifying soft-deleted | MEDIUM | ✅ CONFIRMED | Inconsistent with lifecycle guards in softDelete/restore. |
| F3: dateFrom/dateTo no validation | MEDIUM | ✅ CONFIRMED | Invalid strings produce unpredictable DB behavior. Trivial Zod fix. |

Zero false positives in the original report.
