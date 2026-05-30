# Verified Code Review Report — Cluster 32

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-32.md (Clusters 32 & 33)

---

### Finding 1: Webhook secret field creates empty-string validation trap — CONFIRMED

**Original**: `secret` field uses `z.union([z.string().min(8), z.literal(undefined)])` with no branch for `""`.
**Verification**: Source code at `apps/web/src/lib/forms/incoming-webhook-form-schema.ts:7` confirms:

```ts
secret: z.union([z.string().min(8, "Secret must be at least 8 characters"), z.literal(undefined)]),
```

The union accepts:
1. A string ≥ 8 characters → passes
2. `undefined` literal → passes
3. `""` (empty string) → FAILS both branches

Default value is `secret: undefined` (line 31). The field is typed as `password` with placeholder "Leave empty for token-only auth" (line 24), implying the user can leave it blank. If a user types in the field and then clears it, the value becomes `""` which fails both union branches — the user is stuck. Confirmed validation trap.

---

### Finding 2: Onboarding email-setup "Continue" creates navigation loop — CONFIRMED (nuanced)

**Original**: "Continue" navigates to `/onboarding` which resets the wizard to "language" step.
**Verification**: Source code confirms the navigation:

```tsx
// email-setup.tsx:70-77
<div className="flex justify-end gap-2">
  <Link to="/onboarding/ai-setup">
    <Button variant="outline" size="sm">Back</Button>
  </Link>
  <Link to="/onboarding">
    <Button size="sm">Continue</Button>
  </Link>
</div>
```

The wizard uses `useState` for step tracking:
```ts
// onboarding/index.tsx:58
const [currentStep, setCurrentStep] = useState<WizardStep>("language");
```

Navigating to `/onboarding` unmounts and remounts the wizard, resetting to "language". However, I note a mitigating factor: both the wizard and the email-setup page check `onboardingCompleted` and redirect to `/dashboard` if complete. So this is not an infinite loop — it's a forced wizard restart that requires the user to re-traverse steps. The UX issue is real: users who complete email setup via the standalone page are dumped back at the wizard start instead of advancing to completion. Confirmed.

---

### Finding 3: Lead form schema allows empty strings without transformation — CONFIRMED

**Original**: Lead form uses `z.string().optional()` for optional fields; cleanup deferred to `toLeadFormInput()`.
**Verification**: Source code confirms the inconsistency:

```ts
// lead-form-schema.ts:38-43 — empty strings pass through
email: z.string().optional(),
phone: z.string().optional(),
company: z.string().optional(),
// ...

// client-form-schema.ts:5 — transforms "" to undefined at schema level
const emptyStringToUndefined = z.string().transform((v) => (v === "" ? undefined : v)).optional();
email: emptyStringToUndefined,
phone: emptyStringToUndefined,
```

The lead form relies on `toLeadFormInput()` (lines 150-163) for cleanup via `||`:
```ts
email: values.email || undefined,
```

This is a pattern inconsistency. If any consumer uses the schema output directly without calling `toLeadFormInput()`, empty strings leak through. Confirmed.

---

## Summary

| # | Verdict  | Severity | File | Issue |
|---|----------|----------|------|-------|
| 1 | CONFIRMED | MEDIUM | `incoming-webhook-form-schema.ts` | Empty-string validation trap on secret field |
| 2 | CONFIRMED | MEDIUM | `onboarding/email-setup.tsx` | Continue button resets wizard instead of completing onboarding |
| 3 | CONFIRMED | MEDIUM | `lead-form-schema.ts` | No empty-string transform; inconsistent with client-form-schema |

**Result: 3 CONFIRMED, 0 DISMISSED**
