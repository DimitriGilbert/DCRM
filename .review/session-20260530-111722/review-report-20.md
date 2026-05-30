# Code Review Report — Clusters 20 & 27

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Scope**: Outgoing Webhook CRUD + Auth Builder (Cluster 20), Hook CRUD + Executions + Insights + Billing (Cluster 27)

---

### [SEVERITY: HIGH] Finding 1: Billing router throws plain `Error` instead of `TRPCError`

**File**: packages/api/src/routers/billing/index.ts:19, 35, 53, 65
**Problem**: All error throws in the billing router use plain `Error` instead of tRPC's `TRPCError`. tRPC catches `TRPCError` and returns properly structured error responses to the client. Plain `Error` objects are treated as unexpected internal errors — tRPC returns a generic `INTERNAL_SERVER_ERROR` code and may expose the stack trace depending on the configuration.

**Evidence**:
```typescript
// Line 19
throw new Error("Billing is not enabled in this environment");
// Line 35
throw new Error("Billing is not enabled in this environment");
// Line 53
throw new Error("Billing is not enabled in this environment");
// Line 65
throw new Error("No Stripe customer found for this user");
```

**Impact**: Clients receive a generic 500 error with no actionable error code. The "Billing not enabled" cases should be `PRECONDITION_FAILED` or `BAD_REQUEST` so the client can display an appropriate message. The "No Stripe customer" case should be `NOT_FOUND` or `BAD_REQUEST`. Stack traces could leak to clients in non-production environments.

**Suggestion**: Replace all plain `Error` throws with `TRPCError`:
```typescript
import { TRPCError } from "@trpc/server";

throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Billing is not enabled in this environment" });
// ...
throw new TRPCError({ code: "NOT_FOUND", message: "No Stripe customer found for this user" });
```

---

### [SEVERITY: HIGH] Finding 2: `authMode` in webhook schemas is dead code with contradictory default

**File**: packages/api/src/routers/webhook/schemas.ts:13, 57
**Problem**: The `authMode` field exists in both `createOutgoingWebhookSchema` and `updateOutgoingWebhookSchema` but is **never read by any handler**. The handlers (`create.ts`, `update.ts`) exclusively use `input.authConfig` to determine the auth mode. Worse, the defaults contradict each other: `authMode` defaults to `"custom_headers"` while `authConfig` defaults to `{ mode: "none" }`. This means a caller who omits both fields gets `input.authMode = "custom_headers"` but `input.authConfig = { mode: "none" }`, and the handler will store auth mode `"none"` while the schema's `authMode` field implies `"custom_headers"`.

**Evidence**:
```typescript
// schemas.ts line 13
authMode: outgoingWebhookAuthModeSchema.optional().default("custom_headers"),
// schemas.ts line 15
authConfig: z.union([...]).optional().default({ mode: "none" }),
```

The `create.ts` handler never references `input.authMode`:
```typescript
// create.ts line 15 — only uses authConfig
const auth = buildEncryptedAuth(input.authConfig ?? { mode: "none" });
// create.ts line 50 — returns the mode from the encrypted result, not input.authMode
authMode: auth.mode,
```

**Impact**: Any client that relies on setting `authMode` to control auth behavior will be silently ignored — the auth mode is always determined by `authConfig.mode`. This creates a confusing API contract where one field (`authMode`) appears to control auth but actually does nothing, while a sub-field of another (`authConfig.mode`) is the real control.

**Suggestion**: Remove the `authMode` field from both schemas. The auth mode is already determined by the `mode` discriminant inside `authConfig`, making `authMode` redundant and misleading. If `authMode` is kept for API ergonomics, the handler must validate it matches `authConfig.mode` or derive it from `authConfig.mode` instead of having an independent default.

---

### [SEVERITY: MEDIUM] Finding 3: Webhook list fetches all user hooks then filters in application code

**File**: packages/api/src/routers/webhook/list.ts:23-24
**Problem**: The `listOutgoingWebhooks` query fetches **all hooks** for the user (all types: AI hooks, built-in hooks, outgoing webhooks) from the database, then filters to `outgoing_webhook` type in JavaScript. As the number of non-webhook hooks grows, this transfers increasingly unnecessary data from the database.

**Evidence**:
```typescript
// Line 20 — no type filter in WHERE clause
.where(eq(hooks.userId, ctx.user.id));

// Lines 23-24 — filtered in JS instead
return rows
  .filter((row) => row.type === "outgoing_webhook")
```

Every other webhook operation (read, update, delete) properly filters by type in the SQL query using `eq(hooks.type, HOOK_TYPES.OUTGOING_WEBHOOK)`, but `list` does not.

**Impact**: Unnecessary database I/O and memory usage. If a user has 50 AI hooks and 5 outgoing webhooks, 50 rows are fetched and discarded. This will get worse as more hook types are added.

**Suggestion**: Add the type filter to the SQL query, consistent with the other operations:
```typescript
import { HOOK_TYPES } from "@DCRM/domain";

.where(
  and(
    eq(hooks.userId, ctx.user.id),
    eq(hooks.type, HOOK_TYPES.OUTGOING_WEBHOOK),
  )
);
```
Then remove the `.filter()` call and simplify the `.map()`.

---

### [SEVERITY: MEDIUM] Finding 4: Billing `handleWebhook` is a `publicProcedure` but cannot receive Stripe's raw HTTP POST

**File**: packages/api/src/routers/billing/index.ts:82-126
**Problem**: The Stripe webhook handler is registered as a tRPC `publicProcedure` that accepts `{ body: string, signature: string }` as input. However, Stripe sends webhooks as raw HTTP POST requests with the signature in a `Stripe-Signature` header. There is no separate HTTP endpoint or middleware that bridges Stripe's raw POST to this tRPC procedure. Since the app's API is served exclusively through tRPC at `/api/trpc/$`, Stripe would need to POST to a tRPC-formatted URL, which it cannot do.

**Evidence**:
```typescript
// Line 82-89 — publicProcedure expects tRPC input format
export const handleWebhook = publicProcedure
  .input(
    z.object({
      body: z.string(),
      signature: z.string(),
    }),
  )
  .mutation(async ({ input }) => {
```

No separate raw HTTP endpoint exists in the routes to bridge Stripe to this procedure. The only API handler is the catch-all tRPC route at `apps/web/src/routes/api/trpc/$.ts`.

**Impact**: Stripe webhooks will never reach this handler. The billing integration is non-functional for real Stripe webhook events. Subscriptions cannot be created, updated, or deleted via Stripe's notification system.

**Suggestion**: Create a dedicated TanStack Start API route (e.g., `apps/web/src/routes/api/stripe/webhook.ts`) that:
1. Receives the raw HTTP POST from Stripe
2. Extracts the raw body and `Stripe-Signature` header
3. Calls the subscription service directly (or forwards to the tRPC procedure using `caller`)

Alternatively, restructure to use a direct server function that processes the raw request outside of tRPC.

---

### [SEVERITY: MEDIUM] Finding 5: `accept-insight.ts` wraps a single UPDATE in a needless transaction

**File**: packages/api/src/routers/hook/accept-insight.ts:41-46
**Problem**: The `acceptInsight` mutation uses `db.transaction()` to wrap a single `UPDATE` statement. A transaction is only useful when multiple operations need atomicity. Here, only one `UPDATE` is performed inside the transaction. The naming and structure suggest this was intended to also apply the field mapping to the target entity (e.g., update a contact or company with the AI-suggested fields), but that logic is missing. The insight is marked as `applied: true` without actually writing the mapped fields to any entity.

**Evidence**:
```typescript
// Lines 41-46 — transaction with only one operation
await db.transaction(async (tx) => {
  await tx
    .update(aiInsights)
    .set({ applied: true, fieldMappingResult: { ...mappingResult, fields, appliedAt: new Date().toISOString() } })
    .where(eq(aiInsights.id, input.id));
});
```

The function name `acceptInsight` implies the insight is accepted and applied, but the mapped fields are only returned to the caller. No entity update occurs. If the caller fails to apply the fields, the insight is already marked `applied: true` and cannot be re-accepted (line 26-28 guards against it).

**Impact**: If the client receives the fields but crashes or fails to apply them, the insight is permanently marked as "applied" with no way to retry. The transaction adds unnecessary overhead for a single statement. The "accept" operation is incomplete — it marks acceptance without performing the actual data write.

**Suggestion**: Either (a) apply the field mapping to the target entity within the transaction alongside marking the insight as applied, or (b) if the design intentionally leaves application to the client, remove the premature `applied: true` marking and the unnecessary transaction. If option (b), add a separate `markApplied` mutation that the client calls after successfully writing the fields.

---

## Summary

| # | Severity | File | Title |
|---|----------|------|-------|
| 1 | HIGH | billing/index.ts | Plain `Error` instead of `TRPCError` (4 instances) |
| 2 | HIGH | webhook/schemas.ts | `authMode` is dead code with contradictory defaults |
| 3 | MEDIUM | webhook/list.ts | Fetches all hooks, filters in JS instead of SQL |
| 4 | MEDIUM | billing/index.ts | Stripe webhook handler is unreachable by real Stripe POSTs |
| 5 | MEDIUM | hook/accept-insight.ts | Premature `applied: true` with missing entity update |

**Total findings: 5** (2 HIGH, 3 MEDIUM)
