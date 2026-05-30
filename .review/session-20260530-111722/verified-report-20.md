# Verified Code Review Report — Clusters 20 & 27

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Verifier**: Verification Agent
**Scope**: Outgoing Webhook CRUD + Auth Builder (Cluster 20), Hook CRUD + Executions + Insights + Billing (Cluster 27)

---

### Finding 1: Billing router throws plain `Error` instead of `TRPCError` — CONFIRMED

**Original**: All error throws in the billing router use plain `Error` instead of tRPC's `TRPCError`.

**Verification**: Verified all four instances in `packages/api/src/routers/billing/index.ts`:

| Line | Code |
|------|------|
| 18 | `throw new Error("Billing is not enabled in this environment");` |
| 35 | `throw new Error("Billing is not enabled in this environment");` |
| 53 | `throw new Error("Billing is not enabled in this environment");` |
| 65 | `throw new Error("No Stripe customer found for this user");` |

The file does **not** import `TRPCError` from `@trpc/server`. Neighboring routers in the same package (`webhook/update.ts:1`, `webhook/delete.ts:1`, `hook/accept-insight.ts:1`) all correctly import and use `TRPCError`. This is inconsistent and will cause tRPC to treat these as unexpected internal server errors, returning generic `INTERNAL_SERVER_ERROR` codes to clients instead of semantically meaningful error codes.

---

### Finding 2: `authMode` in webhook schemas is dead code with contradictory defaults — CONFIRMED

**Original**: The `authMode` field exists in both schemas but is never read by any handler. Defaults contradict: `authMode` defaults to `"custom_headers"` while `authConfig` defaults to `{ mode: "none" }`.

**Verification**: Verified across three files:

1. **`schemas.ts:13`** — `authMode: outgoingWebhookAuthModeSchema.optional().default("custom_headers")` — field exists with default `"custom_headers"`
2. **`schemas.ts:15,41`** — `authConfig` union defaults to `{ mode: "none" }` — contradictory default
3. **`schemas.ts:57`** — `authMode` also present in update schema (no default, but still accepted)
4. **`create.ts:15`** — `const auth = buildEncryptedAuth(input.authConfig ?? { mode: "none" })` — reads only `authConfig`, never `input.authMode`
5. **`create.ts:50`** — `authMode: auth.mode` — returns the mode derived from the encrypted auth result, not from `input.authMode`
6. **`update.ts:45-47`** — `if (updates.authConfig !== undefined) { newConfig["auth"] = buildEncryptedAuth(updates.authConfig); }` — reads only `authConfig`, never `authMode`

A caller who omits both fields gets `input.authMode = "custom_headers"` (from schema default) but `input.authConfig = { mode: "none" }` (from schema default), and the handler stores auth mode `"none"`. The `authMode` field is completely ignored — pure dead code with a misleading default.

---

### Finding 3: Webhook list fetches all user hooks then filters in application code — CONFIRMED

**Original**: `listOutgoingWebhooks` fetches all hooks for the user without a type filter, then filters to `outgoing_webhook` in JavaScript.

**Verification**: Verified against source code:

- **`list.ts:20`** — `.where(eq(hooks.userId, ctx.user.id))` — no type filter in the SQL WHERE clause
- **`list.ts:23-24`** — `.filter((row) => row.type === "outgoing_webhook")` — filters in JS
- **`update.ts:20-24`** — Uses `and(eq(hooks.id, id), eq(hooks.userId, ctx.user.id), eq(hooks.type, HOOK_TYPES.OUTGOING_WEBHOOK))` — properly filters by type in SQL
- **`delete.ts:16-20`** — Same proper pattern with `HOOK_TYPES.OUTGOING_WEBHOOK` in SQL WHERE

The inconsistency is confirmed: `update` and `delete` correctly push the type filter to the database, but `list` does not. Additionally, `read.ts:30` also does JS-side filtering (`row.type !== "outgoing_webhook"`), though the impact there is negligible since it fetches a single row by ID.

---

### Finding 4: Billing `handleWebhook` is unreachable by real Stripe POSTs — CONFIRMED

**Original**: The Stripe webhook handler is a tRPC `publicProcedure` expecting `{ body, signature }` as input, but Stripe sends raw HTTP POSTs with the signature in a header. No bridge endpoint exists.

**Verification**:

- **`billing/index.ts:82-126`** — `handleWebhook` is a `publicProcedure` accepting `z.object({ body: z.string(), signature: z.string() })`. This expects tRPC-formatted JSON input, not a raw HTTP POST.
- **No Stripe API route exists**: Glob search for `apps/web/src/routes/api/stripe/**/*` returned zero files.
- **Grep for "stripe" in routes directory** returned zero results.
- **Existing API routes** are only: `api/webhook/$token.ts` (incoming webhooks), `api/auth/$.ts` (Better Auth), `api/trpc/$.ts` (tRPC catch-all).

There is no HTTP endpoint that receives Stripe's raw POST, extracts the `Stripe-Signature` header, reads the raw body, and forwards them to this tRPC procedure. Stripe cannot POST to a tRPC-formatted URL, so this handler is unreachable by real Stripe webhook events.

---

### Finding 5: `accept-insight.ts` wraps a single UPDATE in a needless transaction — CONFIRMED

**Original**: The `acceptInsight` mutation uses `db.transaction()` for a single `UPDATE` statement. The insight is marked `applied: true` without actually writing mapped fields to any entity.

**Verification**: Verified in `packages/api/src/routers/hook/accept-insight.ts`:

```typescript
// Lines 41-46 — the entire transaction body
await db.transaction(async (tx) => {
  await tx
    .update(aiInsights)
    .set({ applied: true, fieldMappingResult: { ...mappingResult, fields, appliedAt: new Date().toISOString() } })
    .where(eq(aiInsights.id, input.id));
});
```

- The transaction contains exactly **one** `UPDATE` — no second operation exists
- No entity (contact, company, etc.) is updated with the mapped fields
- Lines 26-28 guard against re-accepting: `if (insight.applied) { throw new TRPCError({ code: "BAD_REQUEST", ... }) }`
- The mapped `fields` are returned to the caller (line 53) but the insight is already marked `applied: true`

If the caller crashes or fails to apply the returned fields to the target entity, the insight is permanently stuck as "applied" with no retry mechanism. The transaction wrapping is unnecessary overhead for a single statement.

---

## Summary

| # | Severity | Title | Verdict |
|---|----------|-------|---------|
| 1 | HIGH | Plain `Error` instead of `TRPCError` (4 instances) | **CONFIRMED** |
| 2 | HIGH | `authMode` is dead code with contradictory defaults | **CONFIRMED** |
| 3 | MEDIUM | List fetches all hooks, filters in JS instead of SQL | **CONFIRMED** |
| 4 | MEDIUM | Stripe webhook handler is unreachable by real Stripe POSTs | **CONFIRMED** |
| 5 | MEDIUM | Premature `applied: true` with needless transaction | **CONFIRMED** |

**Results: 5 CONFIRMED / 0 DISMISSED**

All five findings in the original report are genuine issues verified against the actual source code. No false positives were identified.
