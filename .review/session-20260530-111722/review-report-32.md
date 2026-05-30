# Code Review Report — Clusters 32 & 33

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Scope**: Settings pages, onboarding flow, form schemas

---

### [SEVERITY: MEDIUM] Finding 1: Webhook secret field creates empty-string validation trap

**File**: `apps/web/src/lib/forms/incoming-webhook-form-schema.ts:7`
**Problem**: The `secret` field uses `z.union([z.string().min(8), z.literal(undefined)])` which has no branch for empty strings. If a user interacts with the optional HMAC secret password field and then clears it, the value becomes `""`. An empty string fails `z.string().min(8)` (too short) AND fails `z.literal(undefined)` (wrong type). The user is stuck with a validation error they cannot resolve — they cannot "undo" back to `undefined` by deleting text. The only escape is closing and reopening the dialog.

**Evidence**:
```ts
// Schema — no branch accepts ""
secret: z.union([z.string().min(8, "Secret must be at least 8 characters"), z.literal(undefined)]),
```
The form field is typed as `password` with placeholder "Leave empty for token-only auth", implying the user should be able to leave it blank. But once the input is touched, the value leaves `undefined` and can never return to it.

**Impact**: Users who click into the secret field and then decide not to provide one get stuck with an unresolvable validation error and must cancel the entire form.

**Suggestion**: Accept empty strings and coerce them to `undefined` in the schema, matching the pattern used in `client-form-schema.ts`:
```ts
secret: z.union([
  z.string().min(8, "Secret must be at least 8 characters"),
  z.literal(""),
  z.literal(undefined),
]).transform((v) => (v === "" ? undefined : v)).optional(),
```
Or more simply, use `.optional()` with a `.refine()`:
```ts
secret: z.string().optional().refine(
  (v) => v === undefined || v === "" || v.length >= 8,
  "Secret must be at least 8 characters"
).transform((v) => (!v ? undefined : v)),
```
This matches the server-side schema (`z.string().min(8).max(256).optional()`) which handles the `string | undefined` case cleanly.

---

### [SEVERITY: MEDIUM] Finding 2: Onboarding email-setup "Continue" creates navigation loop

**File**: `apps/web/src/routes/_authenticated/onboarding/email-setup.tsx:74`
**Problem**: The "Continue" button at the end of the email-setup standalone page navigates to `/onboarding` (the wizard index). The wizard uses `useState` for step tracking (`const [currentStep, setCurrentStep] = useState<WizardStep>("language")`), so navigating back to `/onboarding` resets the wizard to the "language" step. After completing email setup, the user is dumped back at the start of the wizard instead of being advanced to completion.

**Evidence**:
```tsx
// email-setup.tsx:70-77
<div className="flex justify-end gap-2">
  <Link to="/onboarding/ai-setup">
    <Button variant="outline" size="sm">Back</Button>
  </Link>
  <Link to="/onboarding">         {/* <-- Goes to wizard, resets to "language" */}
    <Button size="sm">Continue</Button>
  </Link>
</div>
```

Contrast with the wizard's own `handleNext()` which properly advances through steps:
```tsx
// onboarding/index.tsx:71-88
function handleNext() {
  if (currentStep === "done") {
    completeOnboardingMutation.mutate(
      { locale: selectedLocale },
      { onSuccess: () => { void navigate({ to: "/dashboard" }); } },
    );
    return;
  }
  const nextIndex = currentStepIndex + 1;
  if (nextIndex < STEPS.length) {
    setCurrentStep(STEPS[nextIndex]!.key);
  }
}
```

The standalone email-setup page has no access to `completeOnboardingMutation` or the wizard's step state, so it cannot trigger onboarding completion.

**Impact**: Users who navigate to the standalone onboarding pages (`/onboarding/ai-setup` → `/onboarding/email-setup`) are funneled back to the wizard's start, forced to re-traverse all steps. This is confusing and could prevent users from completing onboarding if they don't realize they need to advance to the "done" step again.

**Suggestion**: The email-setup page should either:
1. Call `completeOnboardingMutation` directly on "Continue" (replicating the completion logic), or
2. Navigate to `/onboarding` with a query parameter (e.g., `?step=done`) that the wizard reads to jump to the final step, or
3. Link directly to a dedicated "complete onboarding" endpoint.

Option 1 is simplest — add the same `completeOnboardingMutation` and `settingsQuery` pattern that the wizard uses, then call it on "Continue" click:
```tsx
const completeOnboardingMutation = useMutation(
  trpc.settings.completeOnboarding.mutationOptions({
    onSuccess: () => {
      toast.success("Welcome to DCRM!");
      void navigate({ to: "/dashboard" });
    },
  }),
);
// ...
<Button size="sm" onClick={() => completeOnboardingMutation.mutate({})}>
  Complete Setup
</Button>
```

---

### [SEVERITY: MEDIUM] Finding 3: Lead form schema allows empty strings for optional fields without transformation

**File**: `apps/web/src/lib/forms/lead-form-schema.ts:38-44`
**Problem**: The lead form uses `z.string().optional()` for optional fields (`email`, `phone`, `company`, `website`, `notes`, `source`). This allows empty strings `""` to pass validation. The cleanup is deferred to `toLeadFormInput()` which converts `""` to `undefined` with `||`. This is inconsistent with `client-form-schema.ts` which uses the `emptyStringToUndefined` Zod transform directly in the schema, ensuring the validated output never contains spurious empty strings. If any consumer uses the schema output directly without calling `toLeadFormInput`, they receive empty strings where `undefined` is expected.

**Evidence**:
```ts
// lead-form-schema.ts — empty strings pass through
email: z.string().optional(),
phone: z.string().optional(),
company: z.string().optional(),
// ...

// vs client-form-schema.ts — empty strings become undefined at schema level
const emptyStringToUndefined = z.string().transform((v) => (v === "" ? undefined : v)).optional();
email: emptyStringToUndefined,
phone: emptyStringToUndefined,
```

The server-side `createEmailAccountSchema` expects well-formed strings (e.g., `z.string().min(1)`), so submitting an empty string would fail at the API boundary — but the error message would be confusing ("String must contain at least 1 character(s)") rather than a clean form-level validation.

**Impact**: Inconsistency between schemas increases cognitive load and risk of bugs when new code consumes `LeadFormValues` directly. If a developer bypasses `toLeadFormInput()` (easy to forget since it's a separate manual step), empty strings leak to the API layer producing unhelpful error messages.

**Suggestion**: Apply the same `emptyStringToUndefined` transform pattern used in `client-form-schema.ts`:
```ts
const emptyToUndef = z.string().transform((v) => (v === "" ? undefined : v)).optional();

const leadFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: emptyToUndef,
  phone: emptyToUndef,
  company: emptyToUndef,
  website: emptyToUndef,
  notes: emptyToUndef,
  source: emptyToUndef,
  stage: leadStageSchema.optional(),
  estimatedValue: z.number().optional(),
  currency: z.string().optional(),
});
```
This would make `toLeadFormInput()` largely unnecessary and align the pattern across all form schemas. Alternatively, extract `emptyToUndef` into a shared utility (e.g., `apps/web/src/lib/forms/helpers.ts`) to avoid duplication.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 3     |

**3 findings** total. No critical or high-severity issues. The two most actionable are the webhook secret validation trap (users can get stuck) and the onboarding navigation loop (users are sent back to the start of the wizard after completing email setup).
