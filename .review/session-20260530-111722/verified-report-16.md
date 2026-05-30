# Verified Report — Clusters 16 & 17 (Project & Ticket CRUD)

**Verifier**: Verification Agent
**Original Report**: `review-report-16.md`
**Date**: 2026-05-30

---

### Finding 1: Project search missing LIKE wildcard escaping — CONFIRMED

**Original**: User input is interpolated directly into the `ILIKE` pattern without escaping SQL LIKE wildcards (`%`, `_`, `\`). The ticket search correctly calls `escapeLikeWildcards()`.

**Verification/Reason**: CONFIRMED by source code.

`project/search.ts:11`:
```typescript
const pattern = `%${input.query}%`;
```

No escaping is applied. No import of `escapeLikeWildcards` exists.

Compare with `ticket/search.ts:6,12`:
```typescript
import { escapeLikeWildcards } from "../../utils/escape-like";
// ...
const pattern = `%${escapeLikeWildcards(input.query)}%`;
```

The `escapeLikeWildcards` utility exists at `packages/api/src/utils/escape-like.ts` and handles `\`, `%`, and `_`. The project search is the only search endpoint in the codebase that omits this escaping. Searching for `"Phase_1"` would incorrectly match `"PhaseA1"`, etc. Severity HIGH is appropriate given it produces incorrect user-facing results.

---

### Finding 2: Ticket upcoming-deadlines uses hardcoded status strings — CONFIRMED

**Original**: The status filter uses hardcoded string literals `["open", "in_progress"]` instead of domain constants `TICKET_STATUSES.OPEN` and `TICKET_STATUSES.IN_PROGRESS`.

**Verification/Reason**: CONFIRMED by source code.

`ticket/upcoming-deadlines.ts:25`:
```typescript
inArray(tickets.status, ["open", "in_progress"]),
```

The file imports from `drizzle-orm` but does NOT import `TICKET_STATUSES` from `@DCRM/domain`.

Compare with `project/upcoming-deadlines.ts:3,24`:
```typescript
import { PROJECT_STATUSES } from "@DCRM/domain";
// ...
inArray(projects.status, [PROJECT_STATUSES.PLANNING, PROJECT_STATUSES.ACTIVE, PROJECT_STATUSES.ON_HOLD]),
```

The `TICKET_STATUSES` constant is defined at `packages/domain/src/ticket.ts:28-33`:
```typescript
export const TICKET_STATUSES = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;
```

The hardcoded values (`"open"`, `"in_progress"`) currently match `TICKET_STATUSES.OPEN` and `TICKET_STATUSES.IN_PROGRESS`, so there is no runtime bug today. However, this violates the single-source-of-truth principle. If the status values ever change in the domain package, this file would silently query stale values with no type error. Severity MEDIUM is appropriate.

---

### Finding 3: Write operations omit userId from WHERE clause — CONFIRMED (defense-in-depth)

**Original**: All write (UPDATE) operations filter only by entity `id` in the WHERE clause, omitting `userId`. Ownership IS verified in a preceding SELECT query.

**Verification/Reason**: CONFIRMED — accurately described as defense-in-depth, not exploitable today.

All six referenced files confirmed. Each UPDATE WHERE clause uses only the entity `id`:

- `project/update.ts:65`: `.where(eq(projects.id, id))`
- `project/soft-delete.ts:32`: `.where(eq(projects.id, input.id))`
- `project/restore.ts:31`: `.where(eq(projects.id, input.id))`
- `ticket/update.ts:64`: `.where(eq(tickets.id, id))`
- `ticket/soft-delete.ts:32`: `.where(eq(tickets.id, input.id))`
- `ticket/restore.ts:31`: `.where(eq(tickets.id, input.id))`

However, EVERY one of these files has a preceding ownership-gated SELECT. For example, `project/update.ts:14-23`:
```typescript
const [existing] = await db
  .select()
  .from(projects)
  .where(
    and(
      eq(projects.id, id),
      eq(projects.userId, ctx.user.id),
    ),
  )
  .limit(1);

if (!existing) {
  return null;
}
```

This pattern is consistent across the entire codebase — the lead router uses the identical pattern (`lead/update.ts:43`, `lead/soft-delete.ts:32`, `lead/restore.ts:31` all omit userId from UPDATE WHERE). The report is factually correct: the UPDATE WHERE clauses lack `userId`, but the finding is accurately scoped as defense-in-depth. Severity MEDIUM is appropriate.

---

## Verification Summary

| Finding | Title                                    | Verdict                      | Severity |
|---------|------------------------------------------|------------------------------|----------|
| 1       | Project search missing LIKE escaping     | CONFIRMED                    | HIGH     |
| 2       | Hardcoded status strings in ticket upcoming-deadlines | CONFIRMED                    | MEDIUM   |
| 3       | Write operations omit userId (defense-in-depth) | CONFIRMED (defense-in-depth) | MEDIUM   |

**Total: 3 confirmed, 0 dismissed**
