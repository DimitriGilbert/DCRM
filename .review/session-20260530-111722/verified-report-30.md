# Verified Code Review Report — Cluster 30

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-30.md

---

### Finding 1: Cannot Clear Optional Fields in Edit Forms — CONFIRMED

**Original**: Users cannot clear optional fields; empty strings become `undefined` which the API treats as "don't change."
**Verification**: Full chain confirmed in source code:

**Client edit** — `client-form-schema.ts:5` transforms `""` → `undefined`:
```ts
const emptyStringToUndefined = z.string().transform((v) => (v === "" ? undefined : v)).optional();
```

`$clientId.edit.tsx:87` spreads validated values directly:
```ts
updateMutation.mutate({ id: clientId, ...values });
```

`packages/api/src/routers/client/update.ts:31-34` skips `undefined`:
```ts
for (const [key, value] of Object.entries(fields)) {
  if (value !== undefined) {
    updates[key] = value;
  }
}
```

**Lead edit** — `$leadId.edit.tsx:90-95` uses `toLeadFormInput()` which converts `""` to `undefined` via `||`, then the API also skips `undefined`.

The API schemas use `.nullable().optional()` where `null` = "clear" and `undefined` = "don't change". But the forms never produce `null` — only `undefined`. Confirmed data integrity bug on the core edit workflow.

---

### Finding 2: Misleading Error Toast on Failed Lead Conversion — CONFIRMED

**Original**: When server rejects conversion, `onSuccess` shows "Conversion succeeded but no client was created."
**Verification**: Source code confirms:

`packages/api/src/routers/lead/convert.ts:27-37` — server returns `null` for all failures:
```ts
if (!lead) { return null; }
if (lead.stage !== "won") { return null; }
if (lead.convertedClientId) { return null; }
```

`$leadId.convert.tsx:33-38` — client interprets null as partial success:
```ts
if (data?.client?.id) {
  toast.success("Lead converted to client");
  navigate({ to: "/clients/$clientId", params: { clientId: data.client.id } });
} else {
  toast.error("Conversion succeeded but no client was created");  // ← WRONG
  navigate({ to: "/leads" });
}
```

The message says "Conversion succeeded" when it actually failed. Confirmed misleading UX.

---

### Finding 3: Kanban Stage Buttons Allow Rapid Duplicate Mutations — CONFIRMED

**Original**: Stage move buttons not disabled during mutation; rapid clicking causes concurrent mutations.
**Verification**: Source code at `leads/index.tsx:256-297` confirms:

```ts
// Lines 256-262 — no disabled prop
function StageMoveButtons({
  currentStage,
  onMove,
}: {
  readonly currentStage: LeadStage;
  readonly onMove: (stage: LeadStage) => void;
}) {
```

Buttons have no `disabled` attribute:
```ts
// Lines 270-278
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

`stageUpdateMutation.isPending` exists in the parent `LeadsPage` scope but is never passed to `StageMoveButtons`. Confirmed.

---

### Finding 4: Convert Page Uses Hardcoded Stage String Instead of Constant — CONFIRMED

**Original**: `$leadId.convert.tsx:71` uses literal `"won"` instead of `LEAD_STAGES.WON`.
**Verification**: Source code confirms:

```ts
// $leadId.convert.tsx:71
if (lead.stage !== "won") {

// Compare with $leadId.tsx:91 which uses the constant
const canConvert = lead.stage === LEAD_STAGES.WON && !lead.convertedClientId;
```

`LEAD_STAGES` is imported in `leads/index.tsx:14` but NOT imported in `$leadId.convert.tsx`. Confirmed inconsistency.

---

### Finding 5: Edit Client Form Accepts Unused `clientId` Prop — CONFIRMED

**Original**: `EditClientForm` declares `clientId` prop but never uses it; suppressed with `void clientId`.
**Verification**: Source code at `$clientId.edit.tsx:95-121` confirms:

```ts
// Lines 95-105 — clientId in signature
function EditClientForm({
  clientId,
  defaultValues,
  onSubmit,
  isPending,
}: {
  readonly clientId: string;        // ← accepted
  ...
}) {

// Line 119 — suppressed
void clientId;

// Line 84 — passed but unused
<EditClientForm
  clientId={clientId}
  ...
/>
```

Confirmed dead code. The `void` expression is a workaround for `noUnusedParameters` in tsconfig.

---

## Summary

| # | Verdict  | Severity | File | Issue |
|---|----------|----------|------|-------|
| 1 | CONFIRMED | HIGH | `$clientId.edit.tsx`, `$leadId.edit.tsx` | Cannot clear optional fields — `undefined` ≠ `null` in API |
| 2 | CONFIRMED | HIGH | `$leadId.convert.tsx` | Misleading "Conversion succeeded" toast on actual failure |
| 3 | CONFIRMED | MEDIUM | `leads/index.tsx` | Kanban stage buttons not disabled during mutation |
| 4 | CONFIRMED | MEDIUM | `$leadId.convert.tsx` | Hardcoded `"won"` instead of `LEAD_STAGES.WON` |
| 5 | CONFIRMED | MEDIUM | `$clientId.edit.tsx` | Unused `clientId` prop with `void` suppression |

**Result: 5 CONFIRMED, 0 DISMISSED**
