# Verified Report — Cluster 17: Project Router

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-17.md`

---

## Verification Summary

| # | Severity | Title | Verdict |
|---|----------|-------|---------|
| 1 | HIGH | `readProject` returns soft-deleted projects | ❌ **DISMISSED** — Intentional pattern |
| 2 | HIGH | `updateProject` can mutate soft-deleted projects | ❌ **DISMISSED** — Consistent codebase pattern |
| 3 | MEDIUM | No date format validation | ✅ **CONFIRMED** |
| 4 | MEDIUM | Hardcoded status values in upcoming-deadlines | ✅ **CONFIRMED** |

---

### Finding 1: `readProject` returns soft-deleted projects — missing `deletedAt` filter

**Verdict**: ❌ **DISMISSED** — Intentional codebase-wide design pattern

**Evidence from source** (`packages/api/src/routers/project/read.ts:14-19`):

The code indeed lacks `isNull(projects.deletedAt)`:
```ts
.where(and(
  eq(projects.id, input.id),
  eq(projects.userId, ctx.user.id),
))
```

However, this is **identical to every other entity read endpoint in the codebase**:

| Router | File | `deletedAt` check in read? |
|--------|------|---------------------------|
| Client | `client/read.ts:14-19` | ❌ No |
| Lead | `lead/read.ts:14-19` | ❌ No |
| Ticket | `ticket/read.ts:14-19` | ❌ No |
| Project | `project/read.ts:14-19` | ❌ No |

This is a **deliberate design pattern**: single-entity reads return the record regardless of soft-delete status, while collection endpoints (`list`, `search`, `upcomingDeadlines`) correctly exclude deleted rows. This supports the restore workflow — the frontend reads a deleted item to display it, then calls `restore` with the same ID.

The original Report 16 for Lead Router explicitly noted this as intentional: *"Returns lead regardless of soft-delete status (consistent with client router pattern — intentional design to allow viewing deleted items)."*

**DISMISSED**: The missing filter is by design, not an oversight. The read endpoint is meant to be permissive.

---

### Finding 2: `updateProject` can mutate soft-deleted projects

**Verdict**: ❌ **DISMISSED** — Consistent codebase-wide pattern

**Evidence from source** (`packages/api/src/routers/project/update.ts:14-23`):

The code indeed lacks `isNull(projects.deletedAt)`:
```ts
.where(and(
  eq(projects.id, id),
  eq(projects.userId, ctx.user.id),
))
```

However, the **exact same pattern** exists in every other entity update endpoint:

| Router | File | `deletedAt` check in update? |
|--------|------|-----------------------------|
| Lead | `lead/update.ts:14-23` | ❌ No |
| Ticket | `ticket/update.ts:14-23` | ❌ No |
| Project | `project/update.ts:14-23` | ❌ No |

This is a **codebase-wide design choice**. In a single-user CRM, the frontend is expected to disable edit functionality after deletion, making server-side enforcement unnecessary. The original Report 16 (Lead Router) reviewed the same pattern in `lead/update.ts` and explicitly accepted it: *"The update-by-id-only (without re-checking userId) follows the established pattern across all entity routers."*

**DISMISSED**: This is a consistent codebase-wide pattern, not a unique oversight in the project router.

---

### Finding 3: No date format validation — invalid strings reach DB as `Invalid Date`

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source**:

1. **`schemas.ts:15-16`**: `startDate: z.string().optional(), endDate: z.string().optional()` — bare `z.string()` with no format constraint.
2. **`create.ts:42-43`**: `startDate: input.startDate ? new Date(input.startDate) : null` — `new Date("not-a-date")` produces `Invalid Date`.
3. **`update.ts:50-51`**: `updates[key] = value ? new Date(value as string) : value` — same issue.
4. **`list.ts:26,29-34`**: `new Date(input.cursor)`, `new Date(input.dateFrom)`, `new Date(input.dateTo)` — same pattern for cursor and date filters.

The report's evidence is **exactly accurate**. Any non-date string passes validation, produces an `Invalid Date` object, and either causes a PostgreSQL error or returns wrong query results. **CONFIRMED at original severity.**

Note: This same issue exists in the ticket router (`ticket/schemas.ts:16,29`, `ticket/create.ts:35`, `ticket/update.ts:33`) and exchange router (`exchange/schemas.ts:32-33`, `exchange/list.ts:33-39`). A fix should be applied consistently across all routers.

---

### Finding 4: `upcomingProjectDeadlines` hardcodes status values instead of domain constants

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source**:

1. **`upcoming-deadlines.ts:23`**: `inArray(projects.status, ["planning", "active", "on_hold"])` — hardcoded strings.
2. **`packages/domain/src/project.ts:3-9`**: `PROJECT_STATUSES = { PLANNING: "planning", ACTIVE: "active", ON_HOLD: "on_hold", ... }` — domain constants exist.
3. **`schemas.ts:3,9`**: `import { projectStatusSchema } from "@DCRM/domain"` — other files in the same module DO import domain types.

The report's evidence is **exactly accurate**. The hardcoded array duplicates values defined in `PROJECT_STATUSES`. If a status is renamed in the domain package, this query silently becomes stale with no compile-time error. **CONFIRMED at original severity.**

---

## Clean Items — No Issues

The report's "Files with no real issues" section was spot-checked:

- **`soft-delete.ts`**: Verified `isNull(deletedAt)` guard prevents double-deletion. ✅
- **`restore.ts`**: Verified `isNotNull(deletedAt)` guard prevents double-restore. ✅
- **`list.ts`**: Verified cursor pagination, `deletedAt` handling, tag filtering. ✅
- **`search.ts`**: Verified `isNull(deletedAt)` filter, parameterized `ilike`. ✅
- **`create.ts`**: Verified client ownership check before insert. ✅
