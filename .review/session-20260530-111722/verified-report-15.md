# Verified Report — Cluster 15: Lead Router

**Verifier**: Verification Agent
**Original Report**: `review-report-15.md`
**Date**: 2026-05-30

---

### Finding 1: `update.ts` allows modifying soft-deleted leads — CONFIRMED

**Original**: The update mutation fetches the lead without checking `deletedAt`, meaning a soft-deleted lead can still have its data modified. This is inconsistent with every other mutation in this router.

**Verification/Reason**: CONFIRMED by source code.

`update.ts:17-21` — the WHERE clause contains only `eq(leads.id, id)` and `eq(leads.userId, ctx.user.id)` — no `isNull(leads.deletedAt)`:

```typescript
// update.ts:17-21
where(
  and(
    eq(leads.id, id),
    eq(leads.userId, ctx.user.id),
    // missing: isNull(leads.deletedAt)
  ),
)
```

Every other mutation in this router enforces the check:
- `update-stage.ts:19` — `isNull(leads.deletedAt)` ✓
- `soft-delete.ts:19` — `isNull(leads.deletedAt)` ✓
- `convert.ts:21` — `isNull(leads.deletedAt)` ✓
- `search.ts:19` — `isNull(leads.deletedAt)` ✓

The inconsistency is real. A soft-deleted lead fetched by ID can still be modified through the `updateLead` mutation, which breaks the soft-delete contract. Severity HIGH is appropriate.

---

### Finding 2: Convert tests are broken — mock DB missing `transaction` method — CONFIRMED

**Original**: The `convert.ts` implementation uses `db.transaction(async (tx) => { ... })`, but the mock `db` object in the test file only has `insert`, `select`, and `update` methods — no `transaction` method.

**Verification/Reason**: CONFIRMED by source code.

`procedures.test.ts:60-122` defines the mock with only three methods:

```typescript
vi.mock("@DCRM/db", () => ({
  db: {
    insert: vi.fn(() => ({ ... })),
    select: vi.fn(() => new Proxy({}, { ... })),
    update: vi.fn(() => new Proxy({}, { ... })),
    // transaction: MISSING
  },
}));
```

`convert.ts:13` calls `db.transaction(async (tx) => { ... })`, which will throw `TypeError: db.transaction is not a function` at runtime.

All four convert test cases (lines 510, 574, 584, 605) would hit this error. The test file also does not mock `tx.select`, `tx.insert`, `tx.update`, or the `.for("update")` chainable used in `convert.ts:25`. Severity HIGH is appropriate — the most complex business logic in the router has zero effective test coverage.

---

### Finding 3: SQL LIKE wildcards in user input are not escaped in `search.ts` — CONFIRMED

**Original**: The search query is interpolated directly into a LIKE pattern with `%${input.query}%`. The characters `%` and `_` are LIKE wildcards.

**Verification/Reason**: CONFIRMED by source code.

`search.ts:11`:
```typescript
const pattern = `%${input.query}%`;
```

No escaping is applied. The `escapeLikeWildcards` utility exists at `packages/api/src/utils/escape-like.ts` and is correctly used by `ticket/search.ts:12`:
```typescript
const pattern = `%${escapeLikeWildcards(input.query)}%`;
```

The lead search does not import or use this utility. Searching for `%` would return all leads, and `_` would match any single character — both bypassing the intended search filter. Data is scoped by `userId`, so this is not a security issue, but it produces incorrect results. Severity MEDIUM is appropriate.

---

### Finding 4: No date format validation for `cursor`, `dateFrom`, `dateTo` in list schema — CONFIRMED

**Original**: The `listLeadsSchema` accepts `cursor`, `dateFrom`, and `dateTo` as `z.string().optional()` with no validation that the strings are valid ISO date strings.

**Verification/Reason**: CONFIRMED by source code.

`schemas.ts:49,53-54`:
```typescript
cursor: z.string().optional(),       // no date validation
dateFrom: z.string().optional(),     // no date validation
dateTo: z.string().optional(),       // no date validation
```

`list.ts:22,26,30` — these are passed to `new Date()`:
```typescript
conditions.push(lt(leads.createdAt, new Date(input.cursor)));
conditions.push(gte(leads.createdAt, new Date(input.dateFrom)));
conditions.push(lte(leads.createdAt, new Date(input.dateTo)));
```

The exchange router correctly validates dates: `exchange/schemas.ts:32-33` uses `z.string().datetime().optional()`.

Malformed strings like `"not-a-date"` produce `Invalid Date` objects, which will cause PostgreSQL query errors or unexpected results. Severity MEDIUM is appropriate.

---

## Verification Summary

| Finding | Title                                    | Verdict   | Severity |
|---------|------------------------------------------|-----------|----------|
| 1       | Soft-delete bypass in update.ts          | CONFIRMED | HIGH     |
| 2       | Convert tests broken (missing transaction mock) | CONFIRMED | HIGH     |
| 3       | LIKE wildcard injection in search.ts     | CONFIRMED | MEDIUM   |
| 4       | No date format validation in list schema | CONFIRMED | MEDIUM   |

**Total: 4 confirmed, 0 dismissed**
