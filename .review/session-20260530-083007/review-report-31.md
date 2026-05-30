# Code Review Report — Cluster 31: Form Schemas

**Reviewer**: Code Review Expert (Cluster 31)
**Date**: 2026-05-30
**Scope**: 10 form schema files in `apps/web/src/lib/forms/`

---

### [SEVERITY: HIGH] Finding 1: `mapping-config-form-schema.ts` — `coerce` select "None" option produces value invalid for the enum schema

**File**: `apps/web/src/lib/forms/mapping-config-form-schema.ts:44-52`
**Problem**: The `coerce` field schema is `z.enum(["string", "number", "boolean"]).optional()`, meaning valid values are `"string"`, `"number"`, `"boolean"`, or `undefined`. However, the select options include `{ label: "None", value: "" }`. When a user selects "None", the value `""` is not `undefined` and is not in the enum — it will fail Zod validation. Users are forced to pick a coercion type and cannot clear/revert the selection.

**Evidence**:
```ts
// Schema (line 9)
coerce: z.enum(["string", "number", "boolean"]).optional(),

// Select options (lines 46-51)
options: [
  { label: "None", value: "" },           // <-- "" is NOT in the enum
  { label: "String", value: "string" },
  { label: "Number", value: "number" },
  { label: "Boolean", value: "boolean" },
],
```

**Impact**: Form validation error when user selects "None" for type coercion. The form cannot be submitted with no coercion selected, or requires a workaround. This is a broken user-facing interaction.

**Suggestion**: Either (a) change the schema to `z.enum(["string", "number", "boolean", ""]).optional()` and handle `""` as "no coercion" at the consumer, or (b) remove the "None" option and rely on the field being truly optional (the select starts empty/undefined), or (c) change "None" to `value: undefined` if Formedible supports it.

---

### [SEVERITY: HIGH] Finding 2: `ai-provider-form-schema.ts` — `baseUrl` and `defaultModel` defaults are `""` but API requires `min(1)` when present

**File**: `apps/web/src/lib/forms/ai-provider-form-schema.ts:9-10,59-65`
**Problem**: The form schema defines `baseUrl: z.string().optional()` and `defaultModel: z.string().optional()` with default values of `""`. The API's `createAIProviderSchema` requires `baseUrl: z.string().min(1).optional()` and `defaultModel: z.string().min(1).optional()`. The form passes values directly to the API mutation (`createMutation.mutate(value)` in `ai-setup.tsx:201`) with no transformation. When the user doesn't fill these optional fields, the defaults `""` pass form validation but would be rejected by the API's `.min(1)` constraint.

**Evidence**:
```ts
// Form schema (lines 9-10)
baseUrl: z.string().optional(),
defaultModel: z.string().optional(),

// Form defaults (lines 63-64)
baseUrl: "",
defaultModel: "",

// API schema (packages/api/src/routers/ai-provider/schemas.ts:8-9)
baseUrl: z.string().min(1).optional(),
defaultModel: z.string().min(1).optional(),

// Consumer — passes value directly (ai-setup.tsx:201)
createMutation.mutate(value);  // no transformation
```

**Impact**: Creating an AI provider without filling in the optional baseUrl/defaultModel fields will cause an API validation error. The user sees "Failed to add provider" instead of successfully creating the provider.

**Suggestion**: Match the API constraint in the form schema: `z.string().min(1).optional()`, and change defaults to `undefined` instead of `""`. Or add a transformation layer (like `toLeadFormInput` in the lead form) that converts empty strings to `undefined` before submitting.

---

### [SEVERITY: HIGH] Finding 3: `client-form-schema.ts` — No empty-string-to-undefined transformation; empty strings stored in DB for optional fields

**File**: `apps/web/src/lib/forms/client-form-schema.ts:5-12,60-67`
**Problem**: All optional fields (`email`, `phone`, `company`, `website`, `notes`) default to `""`. Unlike the lead form which exports a `toLeadFormInput` function to convert empty strings to `undefined`, the client form has no such transformation. The consumer (`clients/create.tsx:40`) passes values directly to the API: `createMutation.mutate(values)`. The API schema accepts `z.string().optional()` which passes `""`, resulting in empty strings being stored in nullable DB columns instead of `null`.

**Evidence**:
```ts
// Form defaults (lines 60-67)
const clientFormDefaultValues: ClientFormValues = {
  name: "",
  email: "",    // "" passed to API → stored as "" in DB instead of null
  phone: "",
  company: "",
  website: "",
  notes: "",
};

// Consumer passes directly (clients/create.tsx:40)
createMutation.mutate(values);  // no transformation

// Compare with lead form which has transformation (lead-form-schema.ts:140-153)
function toLeadFormInput(values: LeadFormValues): LeadFormInput {
  return {
    email: values.email || undefined,  // converts "" → undefined
    ...
  };
}
```

**Impact**: Optional fields are stored as `""` rather than `null`. This breaks queries like "find clients without an email" using `WHERE email IS NULL`. Display logic must handle both `null` and `""` as "empty". The update API schema uses `z.string().nullable().optional()`, meaning there's no way to clear a field back to `null` from this form pattern — the user can only set it to `""`.

**Suggestion**: Add a `toClientFormInput` transformation function (following the pattern established in `lead-form-schema.ts`) that converts `""` to `undefined` for optional string fields. Apply it in all consumers before calling the API mutation.

---

### [SEVERITY: MEDIUM] Finding 4: `lead-form-schema.ts` — `stage` field is `z.string().optional()` instead of the domain enum, and `LEAD_STAGES` is duplicated from `@DCRM/domain`

**File**: `apps/web/src/lib/forms/lead-form-schema.ts:5-13,34`
**Problem**: The `stage` field uses `z.string().optional()` rather than importing `leadStageSchema` from `@DCRM/domain`. This means the form accepts any arbitrary string for stage — only the API catches invalid values. Additionally, `LEAD_STAGES` is redeclared locally (lines 5-13) instead of importing from `@DCRM/domain/src/lead.ts`, violating the project's DRY rule ("Single source of truth for types. Never redeclare across files.").

**Evidence**:
```ts
// Form — duplicated constant (lines 5-13)
export const LEAD_STAGES = {
  NEW: "new",
  CONTACTED: "contacted",
  // ... identical to @DCRM/domain/src/lead.ts
} as const;

// Form — loose schema (line 34)
stage: z.string().optional(),

// Domain — proper enum schema (@DCRM/domain/src/lead.ts:19-27)
export const leadStageSchema = z.enum([...LEAD_STAGES...]);

// API — uses domain enum (packages/api/src/routers/lead/schemas.ts:13)
stage: leadStageSchema.optional(),
```

**Impact**: If domain stages change (e.g., a new stage is added), the form will silently accept invalid values until the API rejects them. The duplicated constant can drift from the canonical source. The same issue applies to `source: z.string().optional()` which has no validation against `LEAD_SOURCE_OPTIONS`.

**Suggestion**: Import `leadStageSchema` from `@DCRM/domain` and use it for the `stage` field. Import `LEAD_STAGES` from `@DCRM/domain` instead of redeclaring. Apply the same pattern to project/ticket form schemas that hardcode enum values.

---

### [SEVERITY: MEDIUM] Finding 5: `email-account-form-schema.ts` — No email format validation on the `email` field

**File**: `apps/web/src/lib/forms/email-account-form-schema.ts:6`
**Problem**: The `email` field uses `z.string().min(1, "Email address is required")` with no email format validation. For an email account configuration form, this accepts arbitrary non-email strings like `"hello"` or `"not-an-email"`. The API schema similarly lacks format validation, so garbage values pass through to the database.

**Evidence**:
```ts
// Form schema (line 6)
email: z.string().min(1, "Email address is required"),

// API schema (packages/api/src/routers/email-account/schemas.ts:4)
email: z.string().min(1),
```

**Impact**: Users can configure email accounts with invalid email addresses. While HTML5 `type="email"` provides browser-level validation, it can be bypassed and doesn't cover all invalid patterns. This is particularly important for an email sync feature where the email address is used for matching incoming emails.

**Suggestion**: Use `z.email()` (as indicated in the project's AGENTS.md Zod 4 syntax guidelines) or `z.string().email()` for format validation. Make it `z.email().min(1, "Email address is required")` or equivalent.

---

### [SEVERITY: MEDIUM] Finding 6: `mapping-config-form-schema.ts` — `staticPayload` is `z.string().optional()` but API expects `z.record(z.string(), z.unknown()).optional()`

**File**: `apps/web/src/lib/forms/mapping-config-form-schema.ts:15`
**Problem**: The form schema defines `staticPayload` as a plain string, but the API's mapping config schema expects it as a JSON record (`z.record(z.string(), z.unknown())`). The form field is a textarea where users type JSON. There's no Zod validation that the string is valid JSON, and the type mismatch means the consumer must parse the string into an object before sending to the API. If skipped, the API rejects the payload.

**Evidence**:
```ts
// Form schema (line 15)
staticPayload: z.string().optional(),

// API schema (packages/api/src/routers/incoming-webhook/schemas.ts:19)
staticPayload: z.record(z.string(), z.unknown()).optional(),

// Form field config (lines 72-77) — textarea with JSON placeholder
{
  name: "staticPayload",
  type: "textarea",
  label: "Static Payload (JSON)",
  placeholder: '{"source": "stripe"}',
}
```

**Impact**: Invalid JSON entered in the textarea passes form validation silently. When submitted to the API, either (a) the string is sent as-is and rejected because the API expects a record, or (b) requires a transformation step that's not documented or exported from the form module. The form gives users no feedback about invalid JSON.

**Suggestion**: Add a `z.string().optional().refine()` that validates the string parses as valid JSON, or transform the field to use `z.record(...)` with appropriate form handling. Export a `toMappingConfigInput` function that parses the JSON string before sending to the API.

---

### [SEVERITY: MEDIUM] Finding 7: `incoming-webhook-form-schema.ts` — Secret validation allows `""` via `.or(z.literal(""))` but API rejects it

**File**: `apps/web/src/lib/forms/incoming-webhook-form-schema.ts:7,29-32`
**Problem**: The form schema uses `.optional().or(z.literal(""))` to explicitly allow `""` as a valid value. The default is `secret: ""`. While the consumer (`incoming-webhooks.tsx:293`) does convert `value.secret || undefined`, the form schema itself is misleading — it validates `""` as acceptable when the intent is "optional secret". The API schema (`z.string().min(8).max(256).optional()`) rejects `""`.

**Evidence**:
```ts
// Form schema (line 7)
secret: z.string().min(8, "Secret must be at least 8 characters").optional().or(z.literal("")),

// Default (line 31)
secret: "",

// Consumer does handle it (incoming-webhooks.tsx:293)
secret: value.secret || undefined,  // "" → undefined ✓

// But the API would reject "" if the consumer didn't do this
// API: z.string().min(8).max(256).optional()
```

**Impact**: Currently mitigated by the consumer's `|| undefined` transformation, but the schema is fragile — if another consumer uses the form and passes values directly (like the AI provider form does), `secret: ""` would be sent to the API and rejected. The `.or(z.literal(""))` workaround should be replaced with proper default handling.

**Suggestion**: Remove `.or(z.literal(""))` and change the default to `secret: undefined`. This makes the schema's intent clear and eliminates the need for per-consumer transformation. Use `z.string().min(8).max(256).optional()` to match the API exactly.

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | HIGH | mapping-config-form-schema.ts | `coerce` "None" option value `""` invalid for enum — form validation broken |
| 2 | HIGH | ai-provider-form-schema.ts | `baseUrl`/`defaultModel` default `""` fails API `min(1)` — mutation will error |
| 3 | HIGH | client-form-schema.ts | No empty-string transformation — optional fields stored as `""` not `null` |
| 4 | MEDIUM | lead-form-schema.ts | `stage` uses `z.string()` not domain enum; duplicated `LEAD_STAGES` |
| 5 | MEDIUM | email-account-form-schema.ts | No email format validation on `email` field |
| 6 | MEDIUM | mapping-config-form-schema.ts | `staticPayload` is string but API expects record; no JSON validation |
| 7 | MEDIUM | incoming-webhook-form-schema.ts | Secret schema allows `""` via workaround instead of proper default |

**Files with no real issues**: `ticket-form-schema.ts` (projectId comes from route params as expected), `appearance-form-schema.ts` (simple and correct), `authorized-address-form-schema.ts` (structural mismatch with API `string[]` is a consumer concern).
