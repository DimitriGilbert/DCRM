# Code Review Report — Cluster 32

**Reviewed**: 9 route files under `_authenticated/clients/` and `_authenticated/leads/`
**Focus**: Data flow — tRPC mutation/query integration, optimistic updates, error handling, loading states, form submission flow
**Date**: 2026-05-30

---

### [SEVERITY: HIGH] Finding 1: False success toast on lead conversion when API returns null

**File**: apps/web/src/routes/_authenticated/leads/$leadId.convert.tsx:30-38
**Problem**: The `convertMutation.onSuccess` fires a success toast *before* checking whether the API actually returned data. The `lead.convert` API returns `null` for three failure cases (lead not found, not in "won" stage, already converted). Since tRPC calls `onSuccess` for any successful HTTP response regardless of data value, a `null` response still triggers the success toast — telling the user the lead was converted when nothing happened.

**Evidence**:
```ts
const convertMutation = useMutation(
  trpc.lead.convert.mutationOptions({
    onSuccess: (data) => {
      toast.success("Lead converted to client");  // fires even if data is null
      // ...
      if (data?.client?.id) {
        navigate({ to: "/clients/$clientId", params: { clientId: data.client.id } });
      } else {
        navigate({ to: "/leads" });  // silent fallback — user sees success toast
      }
    },
```

API (`packages/api/src/routers/lead/convert.ts`) returns `null` on lines 26, 31, 35.

**Impact**: Race condition: the lead could be modified between page load and conversion (e.g., changed to a different stage in another tab). The user sees "Lead converted to client" toast but nothing was converted. They're navigated to `/leads` with no indication of failure. The lead's `convertedClientId` remains null, and no client is created.

**Suggestion**: Move the success toast inside the data-present branch and add error handling for the null case:
```ts
onSuccess: (data) => {
  if (!data?.client?.id) {
    toast.error("Failed to convert lead", {
      description: "The lead may have been modified. Please refresh and try again.",
    });
    return;
  }
  toast.success("Lead converted to client");
  queryClient.invalidateQueries(trpc.lead.list.queryFilter());
  queryClient.invalidateQueries(trpc.client.list.queryFilter());
  queryClient.invalidateQueries(trpc.lead.read.queryFilter({ id: leadId }));
  navigate({ to: "/clients/$clientId", params: { clientId: data.client.id } });
},
```

---

### [SEVERITY: HIGH] Finding 2: Client delete has no confirmation dialog — destructive action fires immediately

**File**: apps/web/src/routes/_authenticated/clients/$clientId.tsx:78-85
**Problem**: The client delete button directly calls `softDeleteMutation.mutate()` on click with zero confirmation. This is a destructive action (soft-delete). The lead detail page (`$leadId.tsx`) correctly implements a confirmation dialog with a `showDeleteDialog` state and a `<Dialog>` component. The client detail page does not.

**Evidence**:
```tsx
<Button
  variant="destructive"
  size="sm"
  onClick={() => softDeleteMutation.mutate({ id: client.id })}
  disabled={softDeleteMutation.isPending}
>
  Delete
</Button>
```

Compare with the lead detail page (lines 121-127, 221-247) which uses `setShowDeleteDialog(true)` on click and a `<Dialog>` for confirmation.

**Impact**: A single accidental click on "Delete" irreversibly soft-deletes the client. While the data can be restored from trash, the user gets no chance to reconsider. This is inconsistent with the lead entity and violates the principle that destructive actions require confirmation.

**Suggestion**: Add a confirmation dialog matching the pattern already used in `$leadId.tsx`:
```tsx
const [showDeleteDialog, setShowDeleteDialog] = useState(false);
// ...
<Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
  Delete
</Button>
<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  {/* Confirmation dialog matching the lead pattern */}
</Dialog>
```

---

### [SEVERITY: MEDIUM] Finding 3: `data?.id ?? ""` fallback navigates to broken route

**File**: apps/web/src/routes/_authenticated/clients/create.tsx:25, apps/web/src/routes/_authenticated/leads/create.tsx:25
**Problem**: On mutation success, navigation uses `data?.id ?? ""` as the route parameter. If the API returns unexpected null/undefined (edge case: DB insert succeeds but the return value is somehow malformed), the fallback is an empty string, producing navigation to `/clients/` or `/leads/` — which are valid routes but show the list page, not a detail page. The user sees a success toast but lands on the list instead of the newly created entity's detail page.

**Evidence**:
```ts
// clients/create.tsx:25
navigate({ to: "/clients/$clientId", params: { clientId: data?.id ?? "" } });

// leads/create.tsx:25
navigate({ to: "/leads/$leadId", params: { leadId: data?.id ?? "" } });
```

**Impact**: If `data.id` is falsy, the user is navigated to a list page after seeing a success toast. They must manually search for the created entity. The `""` fallback hides the actual problem instead of surfacing it.

**Suggestion**: Guard against null data and show an error instead of navigating to a broken route:
```ts
onSuccess: (data) => {
  toast.success("Client created");
  queryClient.invalidateQueries(trpc.client.list.queryFilter());
  if (data?.id) {
    navigate({ to: "/clients/$clientId", params: { clientId: data.id } });
  } else {
    navigate({ to: "/clients" });
  }
},
```

---

### [SEVERITY: MEDIUM] Finding 4: Kanban stage-move buttons only affect the first lead in a column

**File**: apps/web/src/routes/_authenticated/leads/index.tsx:238-248
**Problem**: The `StageMoveButtons` component renders per-column (not per-lead). Its `onMove` callback always targets `columnLeads[0]` — the first lead in the column. Any other leads in the same column cannot be moved via these buttons. The buttons appear below the column, giving the visual impression they apply to the column as a whole.

**Evidence**:
```tsx
<StageMoveButtons
  currentStage={column.key}
  onMove={(stage) => {
    const firstLead = columnLeads[0];
    if (firstLead) {
      onStageChange(firstLead.id, stage);
    }
  }}
/>
```

**Impact**: In a kanban view with multiple leads per stage, only the topmost lead can be moved using the stage buttons. All other leads require the user to click into the detail page to change their stage. This is misleading UX — the buttons look like they move "the column's leads" but silently only move one.

**Suggestion**: Either (a) render move buttons per-lead card (preferred for kanban UX), or (b) clearly label the button to indicate it moves only the first lead (e.g., "Move first →"). Per-card move buttons:
```tsx
{columnLeads.map((lead) => (
  <div key={lead.id}>
    <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
      {/* card content */}
    </Link>
    <StageMoveButtons
      currentStage={column.key}
      onMove={(stage) => onStageChange(lead.id, stage)}
    />
  </div>
))}
```

---

### [SEVERITY: MEDIUM] Finding 5: Search query cache not invalidated after create mutations

**File**: apps/web/src/routes/_authenticated/clients/index.tsx:42, apps/web/src/routes/_authenticated/leads/index.tsx:52-54
**Problem**: After creating a client or lead via the dialog, only the list query cache is invalidated (`trpc.client.list.queryFilter()` / `trpc.lead.list.queryFilter()`). The search query cache (`trpc.client.search` / `trpc.lead.search`) is NOT invalidated. When the user has an active search, the newly created entity won't appear in search results until the search term changes.

**Evidence**:
```ts
// clients/index.tsx — create mutation success:
onSuccess: () => {
  toast.success("Client created");
  queryClient.invalidateQueries(trpc.client.list.queryFilter());  // only list
  setShowCreateDialog(false);
},
```

The displayed data comes from `searchQueryResult` when `searchQuery.length > 0` (line 53-55), which is never invalidated.

**Impact**: User searches for "Acme", gets no results, creates a client named "Acme Corp" via the dialog, dialog closes, search results still show "No clients match your search." The user must clear and re-type the search to see the newly created client.

**Suggestion**: Invalidate the search query cache as well:
```ts
onSuccess: () => {
  toast.success("Client created");
  queryClient.invalidateQueries(trpc.client.list.queryFilter());
  queryClient.invalidateQueries(trpc.client.search.queryFilter());
  setShowCreateDialog(false);
},
```

---

### [SEVERITY: MEDIUM] Finding 6: Lead edit form cannot clear `estimatedValue` — form schema type mismatch with API

**File**: apps/web/src/routes/_authenticated/leads/$leadId.edit.tsx:90-91, apps/web/src/lib/forms/lead-form-schema.ts:35
**Problem**: The lead form schema defines `estimatedValue: z.number().optional()`. When Formedible's number field is cleared by the user, it resolves to `undefined`. The API's `updateLeadSchema` has `estimatedValue: z.number().nullable().optional()`, and the update handler skips `undefined` values. This means clearing the estimated value field has no effect — the old value persists.

**Evidence**:
```ts
// lead-form-schema.ts
estimatedValue: z.number().optional(),  // can be undefined, never null

// $leadId.edit.tsx — mutation call
updateMutation.mutate({ id: leadId, ...values });
// values.estimatedValue is undefined when cleared

// packages/api/src/routers/lead/update.ts — handler
if (value !== undefined) {   // undefined values skipped
  updates[key] = value;
}
```

**Impact**: A user with a lead that has `estimatedValue: 5000` opens the edit form, clears the estimated value field, and saves. The value remains 5000. No error is shown — the save appears successful. The user believes they cleared the value but it persists in the database.

**Suggestion**: Either (a) make the form schema nullable (`z.number().nullable().optional()`) and ensure Formedible maps empty number fields to `null`, or (b) add a transform that converts `undefined` to `null` for the estimated value before mutation:
```ts
onSubmit={(values) => {
  const input = {
    ...values,
    estimatedValue: values.estimatedValue ?? null,
  };
  updateMutation.mutate({ id: leadId, ...input });
}}
```

---

*End of review. 6 findings across 9 files. No critical issues. All findings relate to data flow integrity, error handling gaps, or UX consistency in the tRPC mutation/query integration layer.*
