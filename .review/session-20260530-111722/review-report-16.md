# Code Review Report — Clusters 16 & 17 (Project & Ticket CRUD)

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Files Reviewed**: 24 files across `packages/api/src/routers/project/` and `packages/api/src/routers/ticket/`

---

## Summary

**3 real findings** identified across 24 files.

The codebase is generally well-structured: consistent userId scoping on reads, proper ownership checks before writes, correct soft-delete/restore patterns, well-validated Zod schemas, and good test coverage. The issues found are a functional bug in search, a maintainability concern with hardcoded constants, and a defense-in-depth gap on write queries.

---

### [SEVERITY: HIGH] Finding 1: Project search missing LIKE wildcard escaping

**File**: `packages/api/src/routers/project/search.ts:11`
**Problem**: User input is interpolated directly into the `ILIKE` pattern without escaping SQL LIKE wildcards (`%`, `_`, `\`). This allows users to inject wildcard characters that alter search semantics. The ticket search (`ticket/search.ts:12`) correctly calls `escapeLikeWildcards()`, making this an inconsistency and a bug.

**Evidence**:
```typescript
// project/search.ts — NO escaping
const pattern = `%${input.query}%`;

// ticket/search.ts — CORRECT, uses escaping
const pattern = `%${escapeLikeWildcards(input.query)}%`;
```

**Impact**:
- A user searching for a literal underscore (e.g., `"Phase_1"`) would get results matching `"PhaseA1"`, `"PhaseB1"`, etc., because `_` is the single-character wildcard in `ILIKE`.
- A user searching for `"100%"` would match anything containing `"100"` followed by any characters, since `%` is the multi-character wildcard.
- This produces incorrect search results and breaks the user experience for any query containing `%`, `_`, or `\`.

**Suggestion**: Import and use the existing `escapeLikeWildcards` utility:
```typescript
import { escapeLikeWildcards } from "../../utils/escape-like";
// ...
const pattern = `%${escapeLikeWildcards(input.query)}%`;
```

---

### [SEVERITY: MEDIUM] Finding 2: Ticket upcoming-deadlines uses hardcoded status strings instead of domain constants

**File**: `packages/api/src/routers/ticket/upcoming-deadlines.ts:25`
**Problem**: The status filter uses hardcoded string literals `["open", "in_progress"]` instead of the domain constants `TICKET_STATUSES.OPEN` and `TICKET_STATUSES.IN_PROGRESS`. The project upcoming-deadlines (`project/upcoming-deadlines.ts:24`) correctly uses `PROJECT_STATUSES.PLANNING`, `PROJECT_STATUSES.ACTIVE`, etc.

**Evidence**:
```typescript
// ticket/upcoming-deadlines.ts — HARDCODED
inArray(tickets.status, ["open", "in_progress"]),

// project/upcoming-deadlines.ts — CORRECT, uses constants
inArray(projects.status, [PROJECT_STATUSES.PLANNING, PROJECT_STATUSES.ACTIVE, PROJECT_STATUSES.ON_HOLD]),
```

**Impact**:
- If ticket status values ever change in the domain package (`@DCRM/domain`), this file will silently query stale/incorrect values with no type error.
- Violates the single-source-of-truth principle — the canonical status values are defined in `@DCRM/domain/src/ticket.ts` via `TICKET_STATUSES`.

**Suggestion**:
```typescript
import { TICKET_STATUSES } from "@DCRM/domain";
// ...
inArray(tickets.status, [TICKET_STATUSES.OPEN, TICKET_STATUSES.IN_PROGRESS]),
```

---

### [SEVERITY: MEDIUM] Finding 3: Write operations (update/soft-delete/restore) omit userId from WHERE clause

**Files affected** (6 files):
- `packages/api/src/routers/project/update.ts:65`
- `packages/api/src/routers/project/soft-delete.ts:32`
- `packages/api/src/routers/project/restore.ts:31`
- `packages/api/src/routers/ticket/update.ts:64`
- `packages/api/src/routers/ticket/soft-delete.ts:32`
- `packages/api/src/routers/ticket/restore.ts:31`

**Problem**: All write (UPDATE) operations filter only by entity `id` in the WHERE clause, omitting `userId`. Ownership IS verified in a preceding SELECT query, so this is not an exploitable vulnerability today. However, it violates defense-in-depth principles — if the ownership check is ever refactored, removed, or bypassed (e.g., by a code path that calls the write directly), the write would affect any matching row regardless of ownership.

**Evidence**:
```typescript
// project/update.ts:62-66 — userId missing from WHERE
const [updated] = await db
  .update(projects)
  .set(updates)
  .where(eq(projects.id, id))  // ← only id, no userId
  .returning();

// project/soft-delete.ts:29-33 — same pattern
const [updated] = await db
  .update(projects)
  .set({ deletedAt: now })
  .where(eq(projects.id, input.id))  // ← only id, no userId
  .returning();
```

**Impact**:
- Currently safe because ownership is always verified in the preceding SELECT.
- Risk emerges if the code is refactored and the SELECT check is accidentally skipped.
- A defensive WHERE clause with both `id` and `userId` would make the write self-contained and auditable.

**Suggestion**: Add `userId` to all write WHERE clauses:
```typescript
// project/update.ts
.where(and(eq(projects.id, id), eq(projects.userId, ctx.user.id)))

// project/soft-delete.ts
.where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)))

// Same pattern for restore and all ticket equivalents
```

---

## Non-issues (verified, no action needed)

- **Read endpoints returning soft-deleted records**: `readProject` and `readTicket` don't filter by `deletedAt`. This is consistent with the client router and appears intentional — users can view a deleted entity by ID even though list/search exclude them.
- **Tag subquery not scoped by userId in list queries**: The `entityTags` junction table doesn't have a `userId` column. The main query correctly filters by `userId`, so no data leakage occurs. At very large scale this could become a performance concern, but it's not a bug.
- **`createProjectInDb`/`createTicketInDb` exported without ownership checks**: These are internal helpers designed to be called after ownership is verified. The export is used by tests. This is an acceptable pattern.
- **Cursor pagination using `createdAt`**: Items with identical timestamps could be skipped/duplicated on pagination boundaries. This is a known trade-off of timestamp-based cursors and acceptable for a single-user CRM.

---

## Findings Count: **3**
- **HIGH**: 1
- **MEDIUM**: 2
- **CRITICAL**: 0
