# Verified Code Review Report — Cluster 33: Project/Ticket Routes

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-33.md

---

## Verification Results

### Finding 1: Create mutations show false success toast when API returns null

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `projects/create.tsx:27-30`: `toast.success("Project created")` fires immediately in `onSuccess` before checking if `data` is null. Then `navigate({ ... params: { projectId: data?.id ?? "" } })` navigates with empty string on null.
- `tickets/create.tsx:28-34`: Same pattern — `toast.success("Ticket created")` then `navigate` with `data?.id ?? ""`.
- `projects/index.tsx:50-53`: Dialog-based create — `toast.success("Project created")` fires even on null. Lines 54-56 do check `if (data?.id)` but only for navigation, not for suppressing the toast.

**Impact**: Confirmed for all three files. When ownership verification fails (client not owned by user / project not owned by user), the API returns `null` which is a valid tRPC success response. The toast shows "created" and in the standalone create pages, navigation goes to `/projects/` or `/tickets/` with empty ID.

---

### Finding 2: Empty-string date values from edit forms cause PostgreSQL errors on update

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `$projectId.edit.tsx:75-76`: `startDate: project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : ""` — null dates become `""`.
- `$ticketId.edit.tsx:71`: `dueDate: ticket.dueDate ? new Date(ticket.dueDate).toISOString().split("T")[0] : ""` — same pattern.
- `$projectId.edit.tsx:108`: `updateMutation.mutate({ id: projectId, ...values })` — passes all form values including empty-string dates.
- `packages/api/src/routers/project/update.ts:50-51`: `if (key === "startDate" || key === "endDate") { updates[key] = value ? new Date(value as string) : value; }` — when `value` is `""`, it's falsy, so `updates[key] = ""`, which is an invalid timestamp.
- `packages/api/src/routers/ticket/update.ts:32-33`: Same pattern for `dueDate`.

**Impact**: Confirmed and HIGH severity. This is a real runtime bug. When editing a project or ticket that has null date fields, the form defaults those to `""`. When the user submits (even without touching the dates), `""` is sent to the API update handler, which passes `""` to Drizzle's `.set()` for a timestamp column. PostgreSQL rejects `""` as invalid timestamp syntax. The edit is completely broken for any entity with null dates.

---

### Finding 3: Delete mutations return null silently — user sees success toast for non-existent resources

**Verdict**: ✅ CONFIRMED (but lower practical impact)

**Evidence from source**:
- `$projectId.tsx:42-47`: `onSuccess: () => { toast.success("Project deleted"); ... navigate({ to: "/projects" }); }` — the `onSuccess` callback doesn't receive or check the `data` parameter.
- `$ticketId.tsx:49-54`: Same pattern — no data check.
- `packages/api/src/routers/project/soft-delete.ts:24-26`: Returns `null` if project doesn't exist or is already deleted.

**Impact**: Confirmed but practical impact is lower than stated. For this to trigger, the user would need to soft-delete a project that was already soft-deleted or doesn't exist — which could happen via race conditions (two tabs) or browser back-button navigation after deletion. The soft-delete API correctly filters by `isNull(projects.deletedAt)`, so a second delete returns null. The user sees "deleted" but it was already deleted. Misleading but not data-loss.

---

### Finding 4: Project read query does not filter soft-deleted records, allowing access to deleted projects

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `packages/api/src/routers/project/read.ts:14-19`: Query uses `and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id))` — NO `isNull(projects.deletedAt)` filter.
- Compare with `packages/api/src/routers/project/soft-delete.ts:15-20`: The soft-delete handler correctly uses `isNull(projects.deletedAt)` in its WHERE clause.
- `$projectId.tsx:67-76`: The UI checks `if (!project)` for null, but the API never returns null for a soft-deleted record — it returns the full row with `deletedAt` set.

**Impact**: Confirmed. After soft-deleting a project, navigating to its URL still loads and displays the deleted project. The project detail page shows it as a normal active entity with full edit/delete capabilities. A second soft-delete would succeed (setting `deletedAt` to a new timestamp). This undermines soft-deletion semantics. The same issue likely applies to ticket.read and potentially other entities.

---

## Summary

| # | Verdict | Severity | File(s) | Issue |
|---|---------|----------|---------|-------|
| 1 | ✅ CONFIRMED | HIGH | projects/create.tsx, tickets/create.tsx, projects/index.tsx | False success toast + broken navigation when API returns null |
| 2 | ✅ CONFIRMED | HIGH | $projectId.edit.tsx, $ticketId.edit.tsx | Empty-string dates cause PostgreSQL timestamp errors |
| 3 | ✅ CONFIRMED | MEDIUM | $projectId.tsx, $ticketId.tsx | Delete toast on null return (already deleted resources) |
| 4 | ✅ CONFIRMED | MEDIUM | project/read.ts (API) | Soft-deleted records remain accessible via direct URL |

**All 4 findings confirmed. 0 dismissed.**
