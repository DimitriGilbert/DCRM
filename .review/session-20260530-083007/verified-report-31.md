# Verified Code Review Report — Cluster 31: Form Schemas

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-31.md

---

## Verification Results

### Finding 1: `mapping-config-form-schema.ts` — `coerce` select "None" option produces value invalid for the enum schema

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `mapping-config-form-schema.ts:9`: Schema is `coerce: z.enum(["string", "number", "boolean"]).optional()` — valid values are the three strings or `undefined`.
- `mapping-config-form-schema.ts:47`: Select option `{ label: "None", value: "" }` — empty string is NOT in the enum and NOT `undefined`.
- When user selects "None", the select component sets the value to `""`, which fails Zod validation with `Invalid enum value`.

**Impact**: Confirmed. The form will reject submission when "None" is selected for the coerce field. This is a broken user interaction — the user sees "None" as an option but cannot use it.

---

### Finding 2: `ai-provider-form-schema.ts` — `baseUrl` and `defaultModel` defaults are `""` but API requires `min(1)` when present

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `ai-provider-form-schema.ts:9-10`: Schema is `z.string().optional()` — accepts `""`.
- `ai-provider-form-schema.ts:63-64`: Defaults are `baseUrl: ""` and `defaultModel: ""`.
- `packages/api/src/routers/ai-provider/schemas.ts:8-9`: API schema is `z.string().min(1).optional()` — rejects `""`.
- `ai-setup.tsx:201`: Consumer calls `createMutation.mutate(value)` — passes values directly, no transformation.

**Impact**: Confirmed. When user leaves baseUrl/defaultModel empty (the default), the form submits `""`, which the API rejects with a Zod validation error. The user sees "Failed to add provider" instead of successfully creating the provider with no custom URL/model.

---

### Finding 3: `client-form-schema.ts` — No empty-string-to-undefined transformation; empty strings stored in DB for optional fields

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `client-form-schema.ts:60-67`: All optional fields default to `""`.
- `clients/create.tsx:40`: Consumer passes `createMutation.mutate(values)` directly — no transformation.
- Compare with `lead-form-schema.ts:140-153`: Lead form exports `toLeadFormInput()` that converts `""` → `undefined`.
- The client form lacks an equivalent transformation function.

**Impact**: Confirmed. Optional string fields (`email`, `phone`, `company`, `website`, `notes`) will be stored as `""` instead of `null` in the database. This breaks `IS NULL` queries and requires display logic to handle both `null` and `""`. The lead form correctly handles this pattern, but the client form does not.

---

### Finding 4: `lead-form-schema.ts` — `stage` field is `z.string().optional()` instead of the domain enum, and `LEAD_STAGES` is duplicated from `@DCRM/domain`

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `lead-form-schema.ts:5-13`: `LEAD_STAGES` is locally defined with identical values to `@DCRM/domain/src/lead.ts:3-11`.
- `lead-form-schema.ts:34`: `stage: z.string().optional()` — no enum validation.
- `packages/domain/src/lead.ts:19-27`: `leadStageSchema = z.enum([...])` exists as the canonical source.
- `packages/api/src/routers/lead/schemas.ts` (referenced in original report): API uses the domain enum.

**Impact**: Confirmed. The form accepts any arbitrary string for stage. The duplicated `LEAD_STAGES` constant can drift from the domain package. This violates DRY as specified in AGENTS.md.

---

### Finding 5: `email-account-form-schema.ts` — No email format validation on the `email` field

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `email-account-form-schema.ts:6`: `email: z.string().min(1, "Email address is required")` — no format validation.
- `packages/api/src/routers/email-account/schemas.ts:4`: `email: z.string().min(1)` — API also lacks format validation.
- The form field config at line 23 uses `type: "email"` which provides HTML5 browser validation, but no Zod-level validation.

**Impact**: Confirmed. No server-side or Zod-level email format validation exists. Browser-level `type="email"` can be bypassed. Garbage strings like `"hello"` pass through. This is a valid concern for an email configuration form, though practical impact may be limited since the user must also provide valid IMAP/SMTP credentials.

---

### Finding 6: `mapping-config-form-schema.ts` — `staticPayload` is `z.string().optional()` but API expects `z.record(z.string(), z.unknown()).optional()`

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `mapping-config-form-schema.ts:15`: `staticPayload: z.string().optional()`.
- `packages/api/src/routers/incoming-webhook/schemas.ts:19`: `staticPayload: z.record(z.string(), z.unknown()).optional()`.
- Form field config (lines 72-77): textarea with JSON placeholder.

**Impact**: Confirmed type mismatch. The form accepts any string but the API expects a parsed JSON record. No JSON validation is performed. The consumer must parse the string before sending to the API, or the API will reject the payload. However, the actual impact depends on how the consumer transforms the data before submission — this is a schema-consumer gap.

---

### Finding 7: `incoming-webhook-form-schema.ts` — Secret validation allows `""` via `.or(z.literal(""))` but API rejects it

**Verdict**: ✅ CONFIRMED (with mitigation noted)

**Evidence from source**:
- `incoming-webhook-form-schema.ts:7`: `secret: z.string().min(8, "Secret must be at least 8 characters").optional().or(z.literal(""))`.
- `incoming-webhook-form-schema.ts:31`: Default is `secret: ""`.
- `settings/incoming-webhooks.tsx:293`: Consumer does `secret: value.secret || undefined` — mitigates the issue.
- `packages/api/src/routers/incoming-webhook/schemas.ts:10`: API schema is `secret: z.string().min(8).max(256).optional()`.

**Impact**: Confirmed as a code quality issue, but currently mitigated by the consumer's `|| undefined` transformation. The schema is misleading — it accepts `""` as valid but the intent is "optional". If another consumer uses the form without the transformation, it would fail. The `.or(z.literal(""))` workaround is fragile.

---

## Summary

| # | Verdict | Severity | File | Issue |
|---|---------|----------|------|-------|
| 1 | ✅ CONFIRMED | HIGH | mapping-config-form-schema.ts | `coerce` "None" option value `""` invalid for enum |
| 2 | ✅ CONFIRMED | HIGH | ai-provider-form-schema.ts | `baseUrl`/`defaultModel` default `""` fails API `min(1)` |
| 3 | ✅ CONFIRMED | HIGH | client-form-schema.ts | No empty-string transformation — `""` stored in DB |
| 4 | ✅ CONFIRMED | MEDIUM | lead-form-schema.ts | Duplicated `LEAD_STAGES` and loose `stage` schema |
| 5 | ✅ CONFIRMED | MEDIUM | email-account-form-schema.ts | No email format validation |
| 6 | ✅ CONFIRMED | MEDIUM | mapping-config-form-schema.ts | `staticPayload` type mismatch with API |
| 7 | ✅ CONFIRMED | MEDIUM | incoming-webhook-form-schema.ts | Secret schema allows `""` via workaround |

**All 7 findings confirmed. 0 dismissed.**
