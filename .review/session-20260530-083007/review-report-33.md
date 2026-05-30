# Code Review Report — Cluster 33
## Projects & Tickets Route Pages

**Reviewer**: Code Review Expert (Cluster 33)
**Date**: 2026-05-30
**Files Reviewed**: 9 route files under `apps/web/src/routes/_authenticated/`

---

### [SEVERITY: HIGH] Finding 1: Create mutations show false success toast when API returns null

**File**: `apps/web/src/routes/_authenticated/projects/create.tsx:27-31`
**Also affects**: `apps/web/src/routes/_authenticated/tickets/$projectId/tickets/create.tsx:28-34`, `apps/web/src/routes/_authenticated/projects/index.tsx:50-56`

**Problem**: All three create mutations fire `toast.success(...)` inside `onSuccess` without checking whether `data` is `null`. Both `project.create` and `ticket.create` return `null` when ownership verification fails (client not owned by user / project not owned by user). The `onSuccess` callback fires because tRPC returns a 200 response — `null` is the data payload, not an error. The user sees a "created" success message even though nothing was persisted.

Additionally, `projects/create.tsx:30` and `tickets/create.tsx:33` navigate to a detail page using `data?.id ?? ""`, producing a navigation to `/projects/` or `/projects/$projectId/tickets/` (empty ID) when the API returns null — landing on the index route instead of the expected detail page.

**Evidence**:
```typescript
// projects/create.tsx:27-31
onSuccess: (data) => {
  toast.success("Project created");                        // fires even when data === null
  queryClient.invalidateQueries(trpc.project.list.queryFilter());
  navigate({ to: "/projects/$projectId", params: { projectId: data?.id ?? "" } }); // navigates to /projects/ on null
},
```

```typescript
// API: packages/api/src/routers/project/create.ts:69-71
if (!client) {
  return null;   // Returns null — tRPC treats this as success, not error
}
```

**Impact**: User is shown a false "Project created" / "Ticket created" confirmation and navigated to an unexpected page, while no entity was actually created. In the dialog-based create (`projects/index.tsx`), the dialog closes and the user assumes the project exists.

**Suggestion**: Guard the success path on a truthy `data` return, and surface the null case as an error:
```typescript
onSuccess: (data) => {
  if (!data) {
    toast.error("Failed to create project", {
      description: "Could not verify resource ownership. Please try again.",
    });
    return;
  }
  toast.success("Project created");
  queryClient.invalidateQueries(trpc.project.list.queryFilter());
  navigate({ to: "/projects/$projectId", params: { projectId: data.id } });
},
```

---

### [SEVERITY: HIGH] Finding 2: Empty-string date values from edit forms cause PostgreSQL errors on update

**File**: `apps/web/src/routes/_authenticated/projects/$projectId.edit.tsx:75-77` and `apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.edit.tsx:71`

**Problem**: The edit forms for both projects and tickets construct `defaultValues` that set optional date fields (`startDate`, `endDate`, `dueDate`) to `""` when the entity's date is null. When the user submits the edit form without touching the date fields, the form submits these empty strings. The API update handlers pass `""` directly to Drizzle's `.set()` for timestamp columns, causing PostgreSQL to reject the query with `invalid input syntax for type timestamp`.

This makes the edit feature **completely broken** for any project or ticket that has null date fields — the user cannot edit any field without also filling in all empty date fields.

**Evidence**:
```typescript
// $projectId.edit.tsx:75-77 — default values for edit form
startDate: project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "",
endDate: project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : "",

// $ticketId.edit.tsx:71
dueDate: ticket.dueDate ? new Date(ticket.dueDate).toISOString().split("T")[0] : "",
```

```typescript
// $projectId.edit.tsx:108 — mutation sends all form values including empty-string dates
updateMutation.mutate({ id: projectId, ...values });
// values.startDate === "" when project.startDate was null
```

```typescript
// API: packages/api/src/routers/project/update.ts:50-51 — passes "" to DB
if (key === "startDate" || key === "endDate") {
  updates[key] = value ? new Date(value as string) : value;
  // "" is falsy, so updates.startDate = "" — invalid timestamp for PostgreSQL
}
```

**Impact**: Runtime PostgreSQL error (`invalid input syntax for type timestamp with time zone: ""`) whenever the user edits a project or ticket that has one or more null date fields. The mutation's `onError` handler shows a generic error toast, but the user's changes are lost and the edit cannot succeed unless they also fill in every empty date field.

**Suggestion**: Convert empty date strings to `undefined` before sending the mutation, so the API's `value !== undefined` guard skips them:
```typescript
// $projectId.edit.tsx — in the onSubmit handler
onSubmit={(values) => {
  const sanitized = {
    ...values,
    startDate: values.startDate || undefined,
    endDate: values.endDate || undefined,
  };
  updateMutation.mutate({ id: projectId, ...sanitized });
}}
```

```typescript
// $ticketId.edit.tsx — same pattern
onSubmit={(values) => {
  const sanitized = {
    ...values,
    dueDate: values.dueDate || undefined,
  };
  updateMutation.mutate({ id: ticketId, projectId, ...sanitized });
}}
```

Alternatively, the API update handlers should normalize `""` to `null` for date fields:
```typescript
if (key === "startDate" || key === "endDate") {
  updates[key] = value ? new Date(value as string) : null;
}
```

---

### [SEVERITY: MEDIUM] Finding 3: Delete mutations return null silently — user sees success toast for non-existent resources

**File**: `apps/web/src/routes/_authenticated/projects/$projectId.tsx:41-54`
**Also affects**: `apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.tsx:48-61`

**Problem**: The `softDelete` mutations for projects and tickets display `toast.success("Project deleted")` / `toast.success("Ticket deleted")` inside `onSuccess` without verifying `data` is non-null. The API's `softDeleteProject` and `softDeleteTicket` procedures return `null` when the resource doesn't exist or is already soft-deleted. The user sees a "deleted" confirmation for a resource that was never deleted.

**Evidence**:
```typescript
// $projectId.tsx:42-47
onSuccess: () => {
  toast.success("Project deleted");        // fires even when API returned null
  queryClient.invalidateQueries(trpc.project.list.queryFilter());
  navigate({ to: "/projects" });
},
```

```typescript
// API: packages/api/src/routers/project/soft-delete.ts:24-26
if (!existing) {
  return null;  // Already deleted or not found — but onSuccess still fires on client
}
```

**Impact**: Misleading UX — user believes a delete action was performed on a resource that was already deleted or not found. The navigation away from the page also prevents the user from noticing the inconsistency.

**Suggestion**: Check the mutation result before confirming success:
```typescript
onSuccess: (data) => {
  if (!data) {
    toast.error("Project not found or already deleted");
    return;
  }
  toast.success("Project deleted");
  queryClient.invalidateQueries(trpc.project.list.queryFilter());
  navigate({ to: "/projects" });
},
```

---

### [SEVERITY: MEDIUM] Finding 4: Project read query does not filter soft-deleted records, allowing access to deleted projects

**File**: `apps/web/src/routes/_authenticated/projects/$projectId.tsx:23-25`
**Also affects**: All route files that call `trpc.project.read.queryOptions({ id })`

**Problem**: The `project.read` API (`packages/api/src/routers/project/read.ts`) queries by `id` and `userId` but does NOT filter by `deletedAt IS NULL`. After soft-deleting a project, navigating directly to its URL (e.g., via browser back button or bookmark) will still load and display the deleted project as if it were active. The same applies to `ticket.read`.

The route files correctly handle `null` responses (showing "not found"), but the API never returns `null` for soft-deleted records — it returns the full row with `deletedAt` set.

**Evidence**:
```typescript
// packages/api/src/routers/project/read.ts:14-19 — no deletedAt filter
.where(
  and(
    eq(projects.id, input.id),
    eq(projects.userId, ctx.user.id),
    // Missing: isNull(projects.deletedAt)
  ),
)
```

**Impact**: Soft-deleted projects and tickets remain fully accessible via their direct URLs. The UI displays them as active entities with full edit/delete capabilities. A second soft-delete attempt would also succeed silently. This undermines the purpose of soft deletion and could confuse users who expect deleted items to be inaccessible.

**Suggestion**: This is primarily an API-layer fix, but the route files could add a defensive check. In the API `read.ts`:
```typescript
.where(
  and(
    eq(projects.id, input.id),
    eq(projects.userId, ctx.user.id),
    isNull(projects.deletedAt),
  ),
)
```
Or in the route file, check for `deletedAt` after loading:
```typescript
if (!project || project.deletedAt) {
  return <NotFoundMessage />;
}
```

---

## Summary

| # | Severity | File(s) | Issue |
|---|----------|---------|-------|
| 1 | HIGH | projects/create.tsx, tickets/create.tsx, projects/index.tsx | False success toast + navigation to empty-ID URL when create API returns null |
| 2 | HIGH | $projectId.edit.tsx, $ticketId.edit.tsx | Empty-string dates from form defaults cause PostgreSQL timestamp errors, breaking edit for entities with null dates |
| 3 | MEDIUM | $projectId.tsx, $ticketId.tsx | Delete mutation shows success when API returns null (already deleted / not found) |
| 4 | MEDIUM | All files using project.read / ticket.read | Soft-deleted records remain accessible via direct URL because read API doesn't filter deletedAt |
