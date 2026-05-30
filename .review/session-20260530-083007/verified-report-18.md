# Verified Report — Cluster 18: Ticket Router

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-18.md`

---

## Verification Summary

| # | Severity | Title | Verdict |
|---|----------|-------|---------|
| 1 | HIGH | No project ownership validation when changing `projectId` on update | ✅ **CONFIRMED** |
| 2 | MEDIUM | `dueDate` accepts arbitrary strings — no date format validation | ✅ **CONFIRMED** |
| 3 | MEDIUM | LIKE wildcards in search query are not escaped | ✅ **CONFIRMED** |

---

### Finding 1: No project ownership validation when changing `projectId` on update

**Verdict**: ✅ **CONFIRMED** — HIGH

**Evidence from source**:

**`ticket/update.ts:44-48`** — applies updates without checking project ownership:
```ts
const [updated] = await db
  .update(tickets)
  .Set(updates)          // may contain projectId — never validated
  .where(eq(tickets.id, id))
  .returning();
```

**`ticket/update.ts:29-38`** — `projectId` flows directly into `updates`:
```ts
const updates: Record<string, unknown> = {};
for (const [key, value] of Object.entries(fields)) {
  if (value !== undefined) {
    if (key === "dueDate") {
      updates[key] = value ? new Date(value as string) : value;
    } else {
      updates[key] = value;  // projectId passes through here
    }
  }
}
```

Compare with **`ticket/create.ts:50-59`** which DOES validate:
```ts
const [project] = await db
  .select({ id: projects.id, userId: projects.userId })
  .from(projects)
  .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)))
  .limit(1);
if (!project) { return null; }
```

The report's evidence is **exactly accurate**. The `updateTicketSchema` allows `projectId: z.string().min(1).optional()` (confirmed at `schemas.ts:23`), and the update handler applies it without any ownership check. The DB foreign key constraint will reject non-existent project IDs, but this surfaces as an unhandled 500 database error rather than a clean validation response.

Note: The `project/update.ts` handler demonstrates the correct pattern — it validates `clientId` ownership when changing it (lines 30-45). The ticket handler should do the same for `projectId`.

**CONFIRMED at original severity.**

---

### Finding 2: `dueDate` accepts arbitrary strings — no date format validation

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source**:

1. **`schemas.ts:16`**: `dueDate: z.string().optional()` — bare `z.string()`, no format constraint.
2. **`schemas.ts:29`**: `dueDate: z.string().nullable().optional()` — same issue in update schema.
3. **`create.ts:35`**: `dueDate: input.dueDate ? new Date(input.dueDate) : null` — `new Date("hello")` produces `Invalid Date`.
4. **`update.ts:32-33`**: `updates[key] = value ? new Date(value as string) : value` — same pattern.

The report's evidence is **exactly accurate**. This is the same class of issue as Report 17 Finding 3 (project router dates). An empty string `""` is falsy in JavaScript, so in the update handler it passes through as `""` rather than being converted to `null`, which would also be rejected by the timestamp column.

**CONFIRMED at original severity.** Note: This is a codebase-wide issue affecting all routers that accept date strings (project, ticket, exchange).

---

### Finding 3: LIKE wildcards in search query are not escaped

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source** (`ticket/search.ts`):

**Line 11**: `const pattern = \`%${input.query}%\`;`
**Lines 21-22**: `ilike(tickets.title, pattern), ilike(tickets.description, pattern)`

The report's evidence is **exactly accurate**. User input is interpolated directly into the LIKE pattern without escaping `%` or `_`:

- Query `"100%"` → pattern `%100%%` → matches any text containing `100` followed by anything
- Query `"_"` → pattern `%_%` → matches any text with at least one character (effectively all text)
- Query `"%"` → pattern `%%%` → matches all rows

Drizzle's `ilike` uses parameterized queries, so there is **no SQL injection risk**. The report correctly identifies this as a **functional correctness** issue, not a security issue.

Note: The **exact same issue** exists in `project/search.ts:11` (`const pattern = \`%${input.query}%\`;`). A fix should be applied to both routers.

**CONFIRMED at original severity.**

---

## Clean Items — No Issues

The report's "No Other Issues Found" section was spot-checked:

- **userId scoping**: Verified across `read.ts`, `update.ts`, `soft-delete.ts`, `restore.ts` — all use `eq(tickets.userId, ctx.user.id)`. ✅
- **Soft-delete guards**: `soft-delete.ts` has `isNull(tickets.deletedAt)`, `restore.ts` has `isNotNull(tickets.deletedAt)`. ✅
- **Cursor pagination**: `list.ts` uses `lt(tickets.createdAt, cursor)` with `limit + 1` lookahead. ✅
- **Event emission**: All mutations emit typed events. ✅
