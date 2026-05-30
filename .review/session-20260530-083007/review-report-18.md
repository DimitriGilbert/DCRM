# Code Review Report — Cluster 18: Ticket Router

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Files Reviewed**: 12 files in `packages/api/src/routers/ticket/`

---

## Summary

The ticket router is well-structured overall — proper `userId` scoping on all queries, consistent soft-delete/restore state guards, cursor-based pagination on list, and event emission on mutations. The following real issues were identified during review.

---

### [SEVERITY: HIGH] Finding 1: No project ownership validation when changing `projectId` on update

**File**: `packages/api/src/routers/ticket/update.ts:44-48`
**Problem**: When a user updates a ticket's `projectId`, the handler never verifies that the target project exists and belongs to the user. The `create` handler correctly checks project ownership (lines 50-59), but the `update` handler blindly applies `projectId` if present in the input. The DB foreign key constraint on `tickets.projectId` will reject non-existent project IDs, but this surfaces as an unhandled database error (500) rather than a clean validation response. More critically, if the system ever supports multiple users (or if a project is deleted between the user loading a form and submitting), an invalid project assignment goes unchecked.

**Evidence**:
```typescript
// create.ts correctly validates:
const [project] = await db
  .select({ id: projects.id, userId: projects.userId })
  .from(projects)
  .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)))
  .limit(1);
if (!project) { return null; }

// update.ts applies projectId blindly:
const [updated] = await db
  .update(tickets)
  .set(updates)                // updates may contain projectId — never validated
  .where(eq(tickets.id, id))
  .returning();
```

The `updateTicketSchema` allows `projectId: z.string().min(1).optional()`, and the handler at line 30-38 copies it straight into the `updates` object with no ownership check.

**Impact**: A client sending `{ id: "t1", projectId: "nonexistent-or-unowned" }` gets an opaque 500 database error instead of a validation response. If the system evolves beyond single-user, this becomes a data integrity vulnerability allowing tickets to be reassigned to unowned projects.

**Suggestion**: After building `updates` but before executing the DB update, if `fields.projectId` is present, verify project ownership:

```typescript
if (fields.projectId !== undefined && fields.projectId !== existing.projectId) {
  const [targetProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, fields.projectId), eq(projects.userId, ctx.user.id)))
    .limit(1);
  if (!targetProject) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Target project not found" });
  }
}
```

---

### [SEVERITY: MEDIUM] Finding 2: `dueDate` accepts arbitrary strings — no date format validation

**File**: `packages/api/src/routers/ticket/schemas.ts:16` and `schemas.ts:29`
**Problem**: The `dueDate` field is typed as `z.string()` (or `z.string().nullable().optional()`) with no format constraint. An invalid date string like `"hello"` or `"2025-13-45"` passes schema validation. In `create.ts:35`, `new Date("hello")` produces `Invalid Date` (a Date object with `valueOf() === NaN`). Drizzle/PostgreSQL will reject this with an unhandled database error. In `update.ts:33`, the same problem occurs. Additionally, an empty string `""` passes `z.string()` validation; in the update handler's ternary `value ? new Date(value) : value`, `""` is falsy so it passes `""` to the DB — also rejected by the timestamp column.

**Evidence**:
```typescript
// schemas.ts — no date format constraint
dueDate: z.string().optional(),           // create schema, line 16
dueDate: z.string().nullable().optional(), // update schema, line 29

// create.ts — Invalid Date silently constructed
dueDate: input.dueDate ? new Date(input.dueDate) : null,  // line 35

// update.ts — empty string passes through
if (key === "dueDate") {
  updates[key] = value ? new Date(value as string) : value; // line 33
}
```

**Impact**: Any non-date string causes an unhandled 500 error at the database layer. Empty string on update causes the same. The caller receives no useful validation feedback. `new Date("2025-13-45")` also produces an Invalid Date silently — no error is thrown at the JS layer.

**Suggestion**: Use `z.string().datetime()` or `z.string().date()` (Zod 4) in the schemas, or at minimum add a `.refine()` that validates the string parses to a valid Date:

```typescript
// Option A: ISO datetime
dueDate: z.string().datetime({ offset: true }).optional(),

// Option B: Date-only
dueDate: z.string().date().optional(),

// Option C: Manual refine
dueDate: z.string().refine(
  (v) => !isNaN(new Date(v).getTime()),
  "Invalid date"
).optional(),
```

And in the update handler, explicitly handle `null` vs empty string:
```typescript
if (key === "dueDate") {
  updates[key] = value === null ? null : value ? new Date(value) : null;
}
```

---

### [SEVERITY: MEDIUM] Finding 3: LIKE wildcards in search query are not escaped

**File**: `packages/api/src/routers/ticket/search.ts:11`
**Problem**: User input is interpolated directly into a LIKE pattern without escaping the special characters `%` and `_`. Drizzle-orm's `ilike` uses parameterized queries so there is no SQL injection, but the LIKE semantics are broken for queries containing these characters. Searching for the literal text `%` produces the pattern `%%%` which matches every row. Searching for `_` matches any single character. Users cannot search for ticket titles or descriptions that literally contain `%` or `_`.

**Evidence**:
```typescript
const pattern = `%${input.query}%`;  // line 11
// ...
ilike(tickets.title, pattern),       // line 21
ilike(tickets.description, pattern), // line 22
```

If `input.query` is `"100%"`, the pattern becomes `%100%%` — matching any text containing `100` followed by anything (the trailing `%` is redundant but the inner `%` matches anything).

**Impact**: Users get incorrect search results when their query contains `%` or `_`. Searching for `%` returns all tickets. This is a functional correctness bug rather than a security issue.

**Suggestion**: Escape LIKE wildcards before constructing the pattern:

```typescript
const escaped = input.query.replace(/%/g, "\\%").replace(/_/g, "\\_");
const pattern = `%${escaped}%`;
```

---

## No Other Issues Found

The following aspects were reviewed and found to be sound:

- **userId scoping**: All queries correctly filter by `eq(tickets.userId, ctx.user.id)`. Read, update, soft-delete, and restore all verify ownership before operating.
- **Soft-delete state guards**: `soft-delete.ts` correctly checks `isNull(tickets.deletedAt)` to prevent double-deletion. `restore.ts` correctly checks `isNotNull(tickets.deletedAt)` to prevent restoring non-deleted tickets.
- **Cursor pagination**: `list.ts` implements proper keyset pagination using `createdAt` with `limit + 1` lookahead pattern.
- **Event emission**: All mutations correctly emit typed events after successful operations.
- **Upcoming deadlines**: Correctly filters by status `["open", "in_progress"]`, excludes soft-deleted tickets, and orders by `dueDate` ascending.
