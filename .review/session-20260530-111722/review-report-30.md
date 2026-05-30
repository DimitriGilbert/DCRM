# Code Review Report — Cluster 30

**Reviewer**: Code Reviewer (Automated)
**Date**: 2026-05-30
**Files Reviewed**: 9 route files (clients: index, create, detail, edit; leads: index, create, detail, edit, convert)

---

### [SEVERITY: HIGH] Finding 1: Cannot Clear Optional Fields in Edit Forms

**File**: `apps/web/src/routes/_authenticated/clients/$clientId.edit.tsx:86-88` and `apps/web/src/routes/_authenticated/leads/$leadId.edit.tsx:89-95`
**Problem**: Users cannot clear optional fields (email, phone, company, website, notes) on the edit forms. When a user empties an input field and submits, the value remains unchanged in the database instead of being cleared to `null`.

**Evidence**:

For **client edit** (`$clientId.edit.tsx`), the `clientFormSchema` uses a transform that converts empty strings to `undefined`:

```ts
// client-form-schema.ts
const emptyStringToUndefined = z.string().transform((v) => (v === "" ? undefined : v)).optional();
```

The edit form submit handler spreads the validated form values directly into the mutation:

```ts
// $clientId.edit.tsx:86-88
onSubmit={(values) => {
  updateMutation.mutate({ id: clientId, ...values });
}}
```

For **lead edit** (`$leadId.edit.tsx`), `toLeadFormInput` converts empty strings to `undefined`:

```ts
// lead-form-schema.ts:153
email: values.email || undefined,  // "" || undefined === undefined
```

On the API side, `updateClient` and `updateLead` procedures explicitly skip `undefined` values:

```ts
// packages/api/src/routers/client/update.ts:30-34
for (const [key, value] of Object.entries(fields)) {
  if (value !== undefined) {
    updates[key] = value;
  }
}
```

The API schemas (`updateClientSchema`, `updateLeadSchema`) use `z.string().nullable().optional()` — where `null` means "clear the field" and `undefined` means "don't change." But the forms always produce `undefined` for cleared fields, never `null`.

**Impact**: A user edits a client, clears the email field, clicks Save — the email is silently preserved at its old value. The user has no indication their change was dropped. This is a data integrity bug affecting the core edit workflow.

**Suggestion**: In each edit form's submit handler, explicitly convert `undefined` to `null` for optional fields so the API receives the correct sentinel value:

```ts
// clients/$clientId.edit.tsx — submit handler
onSubmit={(values) => {
  updateMutation.mutate({
    id: clientId,
    name: values.name,
    email: values.email ?? null,
    phone: values.phone ?? null,
    company: values.company ?? null,
    website: values.website ?? null,
    notes: values.notes ?? null,
  });
}}
```

```ts
// leads/$leadId.edit.tsx — submit handler
onSubmit={(values) => {
  const input = toLeadFormInput(values);
  updateMutation.mutate({
    id: leadId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    company: input.company ?? null,
    website: input.website ?? null,
    notes: input.notes ?? null,
    source: input.source ?? null,
    estimatedValue: input.estimatedValue ?? null,
    currency: input.currency ?? null,
  });
}}
```

---

### [SEVERITY: HIGH] Finding 2: Misleading Error Toast on Failed Lead Conversion

**File**: `apps/web/src/routes/_authenticated/leads/$leadId.convert.tsx:36-38`
**Problem**: When the server rejects the conversion (lead not in "won" stage, already converted, or not found), the `onSuccess` handler shows the message "Conversion succeeded but no client was created" — which is factually wrong. The conversion did not succeed; it was blocked by server-side validation.

**Evidence**: The server `convert` procedure returns `null` for all failure cases rather than throwing an error:

```ts
// packages/api/src/routers/lead/convert.ts:27-37
if (!lead) {
  return null;
}
if (lead.stage !== "won") {
  return null;
}
if (lead.convertedClientId) {
  return null;
}
```

The client `onSuccess` handler interprets `null` data as a partial success:

```ts
// $leadId.convert.tsx:30-38
onSuccess: (data) => {
  queryClient.invalidateQueries(trpc.lead.list.queryFilter());
  queryClient.invalidateQueries(trpc.client.list.queryFilter());
  if (data?.client?.id) {
    toast.success("Lead converted to client");
    navigate({ to: "/clients/$clientId", params: { clientId: data.client.id } });
  } else {
    toast.error("Conversion succeeded but no client was created");  // ← WRONG
    navigate({ to: "/leads" });
  }
},
```

**Impact**: The user sees an error saying the conversion "succeeded" when it actually failed. This is confusing and erodes trust in the application's feedback. In the edge case where the lead's stage changed between page load and conversion click (race condition), the user is actively misled.

**Suggestion**: Fix the toast message to accurately describe what happened:

```ts
} else {
  toast.error("Failed to convert lead. It may no longer be in the Won stage or has already been converted.");
  navigate({ to: "/leads" });
}
```

Ideally, the API should throw a `TRPCError` with a specific code instead of returning `null`, so the `onError` handler fires with the correct message. But the toast fix above handles the current API contract correctly.

---

### [SEVERITY: MEDIUM] Finding 3: Kanban Stage Buttons Allow Rapid Duplicate Mutations

**File**: `apps/web/src/routes/_authenticated/leads/index.tsx:256-297`
**Problem**: The `StageMoveButtons` component does not disable its buttons while a stage update mutation is in flight. A user can rapidly click stage-move buttons, queuing multiple concurrent `lead.updateStage` mutations that may race.

**Evidence**: The `StageMoveButtons` component accepts only `currentStage` and `onMove` — no `disabled` prop:

```ts
// leads/index.tsx:256-262
function StageMoveButtons({
  currentStage,
  onMove,
}: {
  readonly currentStage: LeadStage;
  readonly onMove: (stage: LeadStage) => void;
}) {
```

The buttons have no `disabled` attribute:

```ts
// leads/index.tsx:269-280
{prev && (
  <Button
    variant="ghost"
    size="sm"
    className="h-5 px-1 text-[10px]"
    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onMove(prev.key);
    }}
  >
```

Meanwhile, `stageUpdateMutation.isPending` is available in the parent scope (`LeadsPage`) but never passed down.

**Impact**: Rapid clicking could send multiple concurrent stage updates. If responses arrive out of order, the lead could end up in an unexpected stage. Also, the lack of visual feedback during the mutation makes the UI feel unresponsive.

**Suggestion**: Pass `disabled` to `StageMoveButtons` and apply it to the buttons:

```ts
<StageMoveButtons
  currentStage={column.key}
  onMove={(stage) => {
    onStageChange(lead.id, stage);
  }}
  disabled={stageUpdateMutation.isPending}
/>
```

```ts
function StageMoveButtons({
  currentStage,
  onMove,
  disabled = false,
}: {
  readonly currentStage: LeadStage;
  readonly onMove: (stage: LeadStage) => void;
  readonly disabled?: boolean;
}) {
  // ...
  <Button disabled={disabled} onClick={...}>
```

---

### [SEVERITY: MEDIUM] Finding 4: Convert Page Uses Hardcoded Stage String Instead of Constant

**File**: `apps/web/src/routes/_authenticated/leads/$leadId.convert.tsx:71`
**Problem**: The stage check on the convert page uses the literal string `"won"` instead of the `LEAD_STAGES.WON` constant used everywhere else in the codebase.

**Evidence**:
```ts
// $leadId.convert.tsx:71
if (lead.stage !== "won") {

// vs. the same check in the detail page ($leadId.tsx:91):
const canConvert = lead.stage === LEAD_STAGES.WON && !lead.convertedClientId;
```

Every other file consistently imports and uses the `LEAD_STAGES` constant.

**Impact**: If the stage value ever changes, this file would silently break while all others update correctly. More immediately, it creates an inconsistency that makes the codebase harder to maintain.

**Suggestion**: Import `LEAD_STAGES` and use the constant:

```ts
import { LEAD_STAGES } from "@/lib/forms/lead-form-schema";

// line 71:
if (lead.stage !== LEAD_STAGES.WON) {
```

---

### [SEVERITY: MEDIUM] Finding 5: Edit Client Form Accepts Unused `clientId` Prop

**File**: `apps/web/src/routes/_authenticated/clients/$clientId.edit.tsx:95-121`
**Problem**: The `EditClientForm` component declares a `clientId` prop but never uses it. The value is suppressed with `void clientId` on line 119, which is a dead-code workaround.

**Evidence**:
```ts
// $clientId.edit.tsx:95-105
function EditClientForm({
  clientId,
  defaultValues,
  onSubmit,
  isPending,
}: {
  readonly clientId: string;        // ← accepted
  readonly defaultValues: ClientFormValues;
  readonly onSubmit: (values: ClientFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<ClientFormValues>({ ... });

  void clientId;  // ← suppressed, never used

  return <Form className="space-y-4" />;
}
```

The component is called with `clientId` on line 84:
```ts
<EditClientForm
  clientId={clientId}    // ← passed but unused
  defaultValues={defaultValues}
  ...
/>
```

**Impact**: Dead code that confuses readers and violates the project's code rules (no unused parameters with `noUnusedParameters` in tsconfig — the `void` is a workaround to suppress the TypeScript error). If the form ever needs the ID (e.g., for a future update-in-place pattern), it should be used; otherwise it should be removed.

**Suggestion**: Remove the `clientId` prop from the component signature and its call site:

```ts
function EditClientForm({
  defaultValues,
  onSubmit,
  isPending,
}: {
  readonly defaultValues: ClientFormValues;
  readonly onSubmit: (values: ClientFormValues) => void;
  readonly isPending: boolean;
}) {
```

```ts
<EditClientForm
  defaultValues={defaultValues}
  onSubmit={...}
  isPending={...}
/>
```

---

## Summary

| Severity | Count | Finding |
|----------|-------|---------|
| HIGH     | 2     | Cannot clear optional fields in edit forms; Misleading conversion error toast |
| MEDIUM   | 3     | Kanban stage buttons not disabled during mutation; Hardcoded stage string; Unused clientId prop |

**Total findings: 5**

The most impactful bug is **Finding 1** (cannot clear optional fields). It silently drops user edits on the core client/lead edit pages and affects all optional fields. **Finding 2** actively misleads users with an incorrect error message during the lead-to-client conversion flow.
