# Code Review Report — Cluster 15: Lead Router

**Reviewer**: Code Review Expert (Cluster 15)
**Date**: 2026-05-30
**Scope**: `packages/api/src/routers/lead/` (12 files)
**Focus**: Security (userId scoping), business logic (stage transitions, conversion), input validation

---

## Summary

Reviewed all 12 files in the lead router. Found **4 real issues**: 1 HIGH (soft-delete bypass in update), 1 HIGH (broken convert test), and 2 MEDIUM (LIKE wildcard injection, missing date validation).

Security scoping is consistent — every mutation and query is filtered by `ctx.user.id`. The conversion flow is well-designed with transactional safety and row-level locking. The primary concerns are an inconsistency in soft-delete handling across mutations and a test that cannot execute.

---

### [SEVERITY: HIGH] Finding 1: `update.ts` allows modifying soft-deleted leads

**File**: `packages/api/src/routers/lead/update.ts:14-23`
**Problem**: The update mutation fetches the lead without checking `deletedAt`, meaning a soft-deleted lead can still have its data modified. This is inconsistent with every other mutation in this router — `update-stage.ts`, `soft-delete.ts`, `convert.ts`, and `search.ts` all enforce `isNull(leads.deletedAt)`. Soft-deletion is meant to protect the record from further mutation; this endpoint breaks that contract.

**Evidence**:
```typescript
// update.ts — NO deletedAt check
const [existing] = await db
  .select()
  .from(leads)
  .where(
    and(
      eq(leads.id, id),
      eq(leads.userId, ctx.user.id),
      // missing: isNull(leads.deletedAt)
    ),
  )
  .limit(1);
```

Compare with `update-stage.ts:16-22` which correctly enforces it:
```typescript
.where(
  and(
    eq(leads.id, input.id),
    eq(leads.userId, ctx.user.id),
    isNull(leads.deletedAt),  // <-- present
  ),
)
```

**Impact**: A soft-deleted lead can be modified (name, email, company, notes, etc.), which undermines the purpose of soft deletion. If the UI shows deleted leads in a trash view, users could accidentally or intentionally edit "deleted" data. After restoring, the lead would carry unexpected modifications.

**Suggestion**: Add `isNull(leads.deletedAt)` to the WHERE clause in `update.ts`, consistent with all other mutation endpoints:

```typescript
import { eq, and, isNull } from "drizzle-orm";
// ...
.where(
  and(
    eq(leads.id, id),
    eq(leads.userId, ctx.user.id),
    isNull(leads.deletedAt),
  ),
)
```

---

### [SEVERITY: HIGH] Finding 2: Convert tests are broken — mock DB missing `transaction` method

**File**: `packages/api/src/routers/lead/procedures.test.ts:60-122` and `:509-625`
**Problem**: The `convert.ts` implementation uses `db.transaction(async (tx) => { ... })` (line 13 of convert.ts), but the mock `db` object defined in the test file only has `insert`, `select`, and `update` methods — no `transaction` method. When the convert tests execute, `db.transaction` is `undefined`, so calling it throws `TypeError: db.transaction is not a function`. All four convert test cases (lines 510, 574, 584, 605) are affected.

**Evidence**:
```typescript
// procedures.test.ts:60-122 — mock db definition
vi.mock("@DCRM/db", () => ({
  db: {
    insert: vi.fn(() => ({ ... })),
    select: vi.fn(() => new Proxy({}, { ... })),
    update: vi.fn(() => new Proxy({}, { ... })),
    // transaction: MISSING
  },
}));
```

```typescript
// convert.ts:13 — actual code under test
return db.transaction(async (tx) => {
  // ...uses tx.select(), tx.insert(), tx.update()...
});
```

**Impact**: All convert-related tests silently pass false positives or fail at runtime. The conversion flow — the most complex business logic in this router (lead-to-client creation, attachment migration, row locking) — has zero effective test coverage.

**Suggestion**: Add a `transaction` method to the mock that invokes the callback with a mock `tx` object having the same `select`/`insert`/`update` chainable builders:

```typescript
vi.mock("@DCRM/db", () => ({
  db: {
    // ...existing insert, select, update mocks...
    transaction: vi.fn(async (cb: Function) => {
      const tx = {
        select: vi.fn(() => new Proxy({}, { /* same chainable proxy */ })),
        insert: vi.fn(() => ({ values: vi.fn(async () => mockDbState.insertResult) })),
        update: vi.fn(() => new Proxy({}, { /* same chainable proxy */ })),
      };
      return cb(tx);
    }),
  },
}));
```

---

### [SEVERITY: MEDIUM] Finding 3: SQL LIKE wildcards in user input are not escaped in `search.ts`

**File**: `packages/api/src/routers/lead/search.ts:11`
**Problem**: The search query is interpolated directly into a LIKE pattern with `%${input.query}%`. The characters `%` and `_` are LIKE wildcards in PostgreSQL. If a user searches for `%`, the pattern becomes `%%%`, which matches every non-null value. If they search for `_`, it becomes `%_%`, matching any string with at least one character. The Zod schema only validates `z.string().min(1)`, so these characters pass validation.

**Evidence**:
```typescript
// search.ts:11
const pattern = `%${input.query}%`;

// search.ts:20-26
or(
  ilike(leads.name, pattern),
  ilike(leads.email, pattern),
  ilike(leads.company, pattern),
  ilike(leads.website, pattern),
  ilike(leads.source, pattern),
),
```

**Impact**: Searching for `%` returns all leads (bypassing the intended search filter). Searching for `_` returns any lead where the searched column has at least one character. This is a correctness bug — search results won't match user intent when special characters are involved. Since data is scoped by `userId`, this is not a security issue, but it produces misleading results.

**Suggestion**: Escape LIKE wildcards before interpolation:

```typescript
function escapeLike(input: string): string {
  return input.replace(/[%_]/g, "\\$&");
}

const pattern = `%${escapeLike(input.query)}%`;
```

Alternatively, use PostgreSQL's `escape` parameter in the `ilike` call if supported by Drizzle.

---

### [SEVERITY: MEDIUM] Finding 4: No date format validation for `cursor`, `dateFrom`, `dateTo` in list schema

**File**: `packages/api/src/routers/lead/schemas.ts:49,53-54`
**Problem**: The `listLeadsSchema` accepts `cursor`, `dateFrom`, and `dateTo` as `z.string().optional()` with no validation that the strings are valid ISO date strings. In `list.ts`, these are passed directly to `new Date()`, which produces `Invalid Date` for malformed strings. An invalid Date passed to Drizzle's `lt`/`gte`/`lte` operators will either cause a runtime PostgreSQL error or produce unexpected query results.

**Evidence**:
```typescript
// schemas.ts:47-55
export const listLeadsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),       // no date validation
  includeDeleted: z.boolean().default(false),
  stage: leadStageSchema.optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().optional(),     // no date validation
  dateTo: z.string().optional(),       // no date validation
});
```

```typescript
// list.ts:22,26,30 — these will produce Invalid Date for bad strings
conditions.push(lt(leads.createdAt, new Date(input.cursor)));
conditions.push(gte(leads.createdAt, new Date(input.dateFrom)));
conditions.push(lte(leads.createdAt, new Date(input.dateTo)));
```

**Impact**: A malformed date string (e.g., `"not-a-date"` or `"2025-13-45"`) will produce an `Invalid Date` object. When serialized to PostgreSQL, this can cause a query error (crash) or silently return wrong results depending on the driver behavior.

**Suggestion**: Use `z.string().datetime()` or `z.string().date()` (Zod 4) for date string fields, or validate with `z.coerce.date()`:

```typescript
export const listLeadsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().datetime({ optional: true }),
  includeDeleted: z.boolean().default(false),
  stage: leadStageSchema.optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().datetime({ optional: true }),
  dateTo: z.string().datetime({ optional: true }),
});
```

---

## Non-Issues (Verified Clean)

The following aspects were thoroughly checked and are **correct**:

- **userId scoping**: Every query and mutation correctly filters by `ctx.user.id`. No cross-user data leakage is possible.
- **`convert.ts` business logic**: Transaction + `FOR UPDATE` row lock prevents race conditions. Three guard clauses (not found, not "won" stage, already converted) are comprehensive. Attachment migration is correctly included in the transaction.
- **`update-stage.ts` no transition validation**: Skipped intentionally — CRM users need flexibility to move leads between any stage. This is a valid design choice.
- **`read.ts` not filtering deleted**: Acceptable — reading a specific lead by ID (including deleted) is useful for trash/restore UI. The inconsistency is only in `update.ts`.
- **No-op event persister**: `{ insert: async () => {} }` is a global pattern across all routers (27 occurrences). This is a project-wide placeholder, not a lead-router-specific bug.
