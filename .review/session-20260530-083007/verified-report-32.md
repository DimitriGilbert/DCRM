# Verified Code Review Report — Cluster 32: Client/Lead Routes

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-32.md

---

## Verification Results

### Finding 1: False success toast on lead conversion when API returns null

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `$leadId.convert.tsx:30-38`: `onSuccess: (data) => { toast.success("Lead converted to client"); ... }` — the success toast fires at line 31 BEFORE any null check.
- The null check only happens at line 34: `if (data?.client?.id) { navigate(...) } else { navigate({ to: "/leads" }) }`.
- `packages/api/src/routers/lead/convert.ts:25-35`: API returns `null` for three conditions (lead not found line 26, not "won" stage line 30, already converted line 34).
- The page guards against "not won" and "already converted" on lines 70-94, but a race condition (lead modified between page load and conversion click) could still trigger the null return.

**Impact**: Confirmed. In a race condition scenario (e.g., lead modified in another tab between page load and conversion), the API returns `null`, but the toast says "Lead converted to client". The user is navigated to `/leads` with a success message despite nothing happening.

---

### Finding 2: Client delete has no confirmation dialog — destructive action fires immediately

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `$clientId.tsx:78-85`: Delete button directly calls `softDeleteMutation.mutate({ id: client.id })` on click — no confirmation dialog.
- No `showDeleteDialog` state or `<Dialog>` component for delete confirmation anywhere in the file.
- Compare with `$leadId.convert.tsx` which correctly uses a confirmation dialog (lines 149-174).
- The report also mentions `$leadId.tsx` using a confirmation dialog — this is a separate detail page for leads.

**Impact**: Confirmed. A single accidental click on "Delete" soft-deletes the client with no chance to cancel. This is inconsistent with destructive action patterns elsewhere in the app.

---

### Finding 3: `data?.id ?? ""` fallback navigates to broken route

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `clients/create.tsx:25`: `navigate({ to: "/clients/$clientId", params: { clientId: data?.id ?? "" } })`.
- `leads/create.tsx:25`: `navigate({ to: "/leads/$leadId", params: { leadId: data?.id ?? "" } })`.
- Both use `?? ""` as fallback for navigation params, producing `/clients/` or `/leads/` URLs.

**Impact**: Confirmed, though the practical severity is lower than stated. If the API returns a successful response with null data (edge case), the fallback `""` produces navigation to the index route (which is valid TanStack Router behavior — it matches the index route). The user sees a success toast but lands on the list page instead of the detail page. However, this is a defensive coding issue — the create APIs (client.create, lead.create) are unlikely to return null for the normal success case since they directly insert and return the row.

---

### Finding 4: Kanban stage-move buttons only affect the first lead in a column

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `leads/index.tsx:238-248`: `StageMoveButtons` is rendered per-column (not per-lead card). The `onMove` callback targets `columnLeads[0]`:
  ```tsx
  onMove={(stage) => {
    const firstLead = columnLeads[0];
    if (firstLead) {
      onStageChange(firstLead.id, stage);
    }
  }}
  ```
- The buttons appear at the bottom of each column (line 238), after all lead cards.
- The condition `columnLeads.length > 0` (line 238) ensures buttons only show when there are leads.

**Impact**: Confirmed. When a column has multiple leads, only the first lead can be moved using these buttons. This is misleading UX — the buttons appear below the column giving the impression they apply generally, but silently only move the topmost lead.

---

### Finding 5: Search query cache not invalidated after create mutations

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `clients/index.tsx:38-51`: Create mutation only invalidates `trpc.client.list.queryFilter()` — no search invalidation.
- `clients/index.tsx:31-36`: Search query is a separate query using `trpc.client.search.queryOptions`.
- `clients/index.tsx:53-55`: Display data comes from `searchQueryResult` when `searchQuery.length > 0`.
- Same pattern in `leads/index.tsx:49-61`: Only `trpc.lead.list.queryFilter()` invalidated.

**Impact**: Confirmed. After creating a client/lead via dialog while a search is active, the new entity won't appear in search results until the search query changes or the search is cleared.

---

### Finding 6: Lead edit form cannot clear `estimatedValue` — form schema type mismatch with API

**Verdict**: ✅ CONFIRMED (with nuance)

**Evidence from source**:
- `lead-form-schema.ts:35`: `estimatedValue: z.number().optional()` — form value can be `number | undefined`, never `null`.
- `$leadId.edit.tsx:91`: `updateMutation.mutate({ id: leadId, ...values })` — passes values directly.
- `packages/api/src/routers/lead/update.ts:31`: `if (value !== undefined)` — undefined values are skipped.
- When a number field is cleared in Formedible, it resolves to `undefined` (not `null`).
- The API update handler at line 31 skips `undefined` values, so clearing the field has no effect.

**Impact**: Confirmed. User with `estimatedValue: 5000` opens edit form, clears the field, saves. The value remains 5000 because `undefined` is skipped by the update handler. The user sees "Lead updated" toast but the value persists. This is a real UX bug.

---

## Summary

| # | Verdict | Severity | File | Issue |
|---|---------|----------|------|-------|
| 1 | ✅ CONFIRMED | HIGH | $leadId.convert.tsx | False success toast when API returns null |
| 2 | ✅ CONFIRMED | HIGH | $clientId.tsx | No confirmation dialog for client delete |
| 3 | ✅ CONFIRMED | MEDIUM | clients/create.tsx, leads/create.tsx | `data?.id ?? ""` fallback navigates to broken route |
| 4 | ✅ CONFIRMED | MEDIUM | leads/index.tsx | Kanban stage-move buttons only affect first lead |
| 5 | ✅ CONFIRMED | MEDIUM | clients/index.tsx, leads/index.tsx | Search cache not invalidated after create |
| 6 | ✅ CONFIRMED | MEDIUM | $leadId.edit.tsx | Cannot clear `estimatedValue` — undefined skipped by API |

**All 6 findings confirmed. 0 dismissed.**
