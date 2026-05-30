# Code Review Report — Cluster 17: Project Router

**Reviewer**: Code Review Expert (Cluster 17)
**Date**: 2026-05-30
**Scope**: Full CRUD for projects plus search, soft-delete/restore, and upcoming deadlines

---

## Summary

Reviewed 12 files implementing the project router. Found **4 real issues**: 2 HIGH-severity data integrity bugs where soft-delete is not respected by `read` and `update` operations, 1 MEDIUM-severity validation gap allowing invalid date strings to reach the database, and 1 MEDIUM maintenance hazard with hardcoded domain values.

---

### [SEVERITY: HIGH] Finding 1: `readProject` returns soft-deleted projects — missing `deletedAt` filter

**File**: `packages/api/src/routers/project/read.ts:14-19`
**Problem**: The read query filters only by `id` and `userId` but does **not** check `isNull(projects.deletedAt)`. Every other read-path (`list`, `search`, `upcomingDeadlines`) correctly excludes soft-deleted rows. This means a soft-deleted project is invisible in listings/search, yet fully retrievable if you know the ID — an inconsistent API contract.

**Evidence**:
```ts
// read.ts — no deletedAt check
.where(
  and(
    eq(projects.id, input.id),
    eq(projects.userId, ctx.user.id),
    // MISSING: isNull(projects.deletedAt)
  ),
)
```

Compare with every other read-path which correctly guards:
```ts
// list.ts:13-15, search.ts:19, upcoming-deadlines.ts:22
isNull(projects.deletedAt),
```

**Impact**: A soft-deleted project silently resurfaces if a client re-fetches by ID (e.g., cached detail page, browser back-button). Frontend code that expects deleted items to be absent may render stale UI or show actions (edit, delete) that conflict with the deleted state. This also breaks the restore workflow — users can read a deleted project but can't restore it via the same ID without calling `restore` first, which is confusing.

**Suggestion**: Add `isNull(projects.deletedAt)` to the where clause:

```ts
.where(
  and(
    eq(projects.id, input.id),
    eq(projects.userId, ctx.user.id),
    isNull(projects.deletedAt),
  ),
)
```

Import `isNull` from `drizzle-orm`. If you want to support reading deleted projects (e.g., for admin/restore UI), add an optional `includeDeleted` flag to the input schema.

---

### [SEVERITY: HIGH] Finding 2: `updateProject` can mutate soft-deleted projects — missing `deletedAt` filter

**File**: `packages/api/src/routers/project/update.ts:14-23`
**Problem**: The update procedure fetches the existing project without checking `deletedAt`. A soft-deleted project can have its name, status, budget, dates — everything — modified while remaining in the deleted state. This directly violates the soft-delete contract: deleted records should be immutable until explicitly restored.

**Evidence**:
```ts
// update.ts:14-23 — no deletedAt check
const [existing] = await db
  .select()
  .from(projects)
  .where(
    and(
      eq(projects.id, id),
      eq(projects.userId, ctx.user.id),
      // MISSING: isNull(projects.deletedAt)
    ),
  )
  .limit(1);
```

Meanwhile, `softDelete` itself correctly checks `isNull(projects.deletedAt)` before setting the timestamp.

**Impact**: A user can soft-delete a project and then update its status to `"completed"` or change its `endDate`. This creates silent data corruption — the project is marked deleted but contains modified data. If restored later, the user sees unexpected changes. It also means a race condition: a client could issue `softDelete` and `update` concurrently, with the update winning, leaving a modified-but-deleted row.

**Suggestion**: Add `isNull(projects.deletedAt)` to the ownership check, consistent with `softDelete`:

```ts
const [existing] = await db
  .select()
  .from(projects)
  .where(
    and(
      eq(projects.id, id),
      eq(projects.userId, ctx.user.id),
      isNull(projects.deletedAt),
    ),
  )
  .limit(1);
```

---

### [SEVERITY: MEDIUM] Finding 3: No date format validation — invalid strings reach DB as `Invalid Date`

**File**: `packages/api/src/routers/project/schemas.ts:15-16,31-32` (schema), `create.ts:42-43` (usage), `update.ts:50-51` (usage)
**Problem**: `startDate` and `endDate` are validated as bare `z.string()`. Any non-empty string (e.g., `"not-a-date"`, `"yesterday"`, `"2025-13-45"`) passes validation. The code then passes `new Date(input)` to Drizzle, which produces an `Invalid Date` object that PostgreSQL rejects with a raw database error instead of a clean tRPC validation error.

**Evidence**:
```ts
// schemas.ts:15-16
startDate: z.string().optional(),
endDate: z.string().optional(),
```

```ts
// create.ts:42-43 — Invalid Date if string is not parseable
startDate: input.startDate ? new Date(input.startDate) : null,
endDate: input.endDate ? new Date(input.endDate) : null,
```

Same pattern in `update.ts:50-51`:
```ts
updates[key] = value ? new Date(value as string) : value;
```

**Impact**: The caller receives an opaque 500-style database error (e.g., `invalid input syntax for type timestamp`) instead of a structured tRPC `BAD_REQUEST` validation error. This makes debugging harder and leaks implementation details (column type) to the client.

**Suggestion**: Use `z.string().datetime()` or a `z.string().transform()` with validation in the schema:

```ts
// Option A: ISO 8601 datetime
startDate: z.string().datetime({ offset: true }).optional(),

// Option B: Custom transform that validates and produces Date
startDate: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date").optional(),
```

Or at minimum, validate in the procedure before creating `new Date()`:
```ts
if (input.startDate && isNaN(Date.parse(input.startDate))) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid startDate" });
}
```

Note: `list.ts:26,29-34` has the same pattern for `cursor`, `dateFrom`, and `dateTo` — those should also be validated.

---

### [SEVERITY: MEDIUM] Finding 4: `upcomingProjectDeadlines` hardcodes status values instead of referencing domain constants

**File**: `packages/api/src/routers/project/upcoming-deadlines.ts:23`
**Problem**: The status filter uses a hardcoded array `["planning", "active", "on_hold"]` instead of referencing `PROJECT_STATUSES` from `@DCRM/domain`. The rest of the codebase (`schemas.ts`, `create.ts`) correctly imports and uses `projectStatusSchema` and `ProjectStatus` types from the domain package.

**Evidence**:
```ts
// upcoming-deadlines.ts:23 — magic strings
inArray(projects.status, ["planning", "active", "on_hold"]),
```

**Impact**: If a status value is ever renamed or a new "active-like" status is added to `PROJECT_STATUSES` in `@DCRM/domain`, this query will silently become stale. It won't break at compile time because the values are strings, not type-checked references. For example, if `"on_hold"` is renamed to `"paused"`, this query would still filter for the old `"on_hold"` value and return zero on-hold/paused projects.

**Suggestion**: Import and use the domain constants:

```ts
import { PROJECT_STATUSES } from "@DCRM/domain";

// ...
inArray(projects.status, [
  PROJECT_STATUSES.PLANNING,
  PROJECT_STATUSES.ACTIVE,
  PROJECT_STATUSES.ON_HOLD,
]),
```

This ensures compile-time safety and a single source of truth.

---

## Files with no real issues

- **`index.ts`** — Clean router composition, all procedures wired correctly.
- **`soft-delete.ts`** — Correctly checks `isNull(deletedAt)` to prevent double-deletion, sets timestamp, emits event.
- **`restore.ts`** — Correctly checks `isNotNull(deletedAt)` to prevent double-restore, clears timestamp.
- **`list.ts`** — Proper cursor pagination, correct `deletedAt` handling, tag filtering is safe (the `userId` condition in the main query prevents cross-user data leaks even though the entityTags subquery isn't userId-scoped).
- **`search.ts`** — Correct `deletedAt` filter, proper `ilike` pattern, userId scoping.
- **`create.ts`** — Validates client ownership before insert, proper defaults, emits event.
- **`procedures.test.ts`** — Tests cover the main paths (create, read, update, delete, restore, list, search) with appropriate mock setup.
- **`schemas.test.ts`** — Covers required/optional fields, defaults, and validation edge cases.
