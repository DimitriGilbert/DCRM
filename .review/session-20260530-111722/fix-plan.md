# Fix Plan — DCRM2 Review (session-20260530-111722)

## Overview

This plan addresses **71 confirmed findings** from 23 verified review reports. Findings are grouped into **12 phases** ordered by: security first, then data integrity/correctness, then API logic, then UI bugs, then test/code quality. Each phase is sized to fit within a single agent's context window.

- **Phase 1**: Security — Authorization bypasses & data exposure (4 files)
- **Phase 2**: Security — Input validation & injection (7 files)
- **Phase 3**: Database schema fixes (2 files)
- **Phase 4**: Event engine bugs (4 files)
- **Phase 5**: AI core bugs (1 file)
- **Phase 6**: Billing, webhook core & storage (6 files)
- **Phase 7**: API defense-in-depth — userId scoping & error handling (10 files)
- **Phase 8**: Web app — Critical navigation & form bugs (10 files)
- **Phase 9**: Web app — Auth, UI & accessibility (10 files)
- **Phase 10**: Native app fixes (11 files)
- **Phase 11**: Email, i18n & attachment packages (6 files)
- **Phase 12**: Test fixes (2 files)

## Prerequisites

- pnpm (via corepack)
- TypeScript strict mode (verbatimModuleSyntax, noUnusedLocals, noUnusedParameters)
- Gatekeeping commands: `pnpm check-types` and `pnpm build`
- All findings sourced from verified reports in `.review/session-20260530-111722/verified-report-*.md`

## Gatekeeping Commands

- Type check: `pnpm check-types`
- Build: `pnpm build`

---

## Phase 1: Security — Authorization Bypasses & Data Exposure

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Entity-tag attach — verify entity ownership** (`packages/api/src/routers/entity-tag/attach.ts:39-48`):
   - After the tag ownership check (lines 21-30), add a call to verify that the entity (client/lead/project/ticket/exchange) belongs to `ctx.user.id`. Use the existing `verifyEntityOwnership()` pattern from `packages/api/src/routers/attachment/upload.ts:17-49` as reference. All five entity tables (clients, leads, projects, tickets, exchanges) have `userId` columns. Throw `TRPCError({ code: "NOT_FOUND" })` if ownership fails.

2. **Entity-tag detach — verify entity ownership** (`packages/api/src/routers/entity-tag/detach.ts:26-34`):
   - Same as above: add entity ownership verification before the delete. Use `input.entityType` and `input.entityId` to resolve the correct table and verify `userId`.

3. **Full data export — exclude encrypted API keys** (`packages/api/src/routers/full-data-export.ts:64`):
   - Replace `db.select().from(aiProviders)` with a column projection that excludes `encryptedApiKey` and `config`. Follow the safe-column pattern from `packages/api/src/routers/ai-provider/list.ts:9-17` which selects only: `id, provider, name, baseUrl, enabled, createdAt, updatedAt`.

4. **Storage path traversal — validate userId** (`packages/storage/src/local.ts:207-209`):
   - Add a `validateUserId(userId: string)` method similar to the existing `validateKey()` (lines 222-229). Reject userIds containing `..`, starting with `/`, or containing null bytes. Call it inside `resolvePath()` before constructing the path, or at the top of every public method (`put`, `get`, `delete`).

**Inputs**:
- Read: `packages/api/src/routers/entity-tag/attach.ts`
- Read: `packages/api/src/routers/entity-tag/detach.ts`
- Read: `packages/api/src/routers/attachment/upload.ts` (for `verifyEntityOwnership` pattern)
- Read: `packages/api/src/routers/full-data-export.ts`
- Read: `packages/api/src/routers/ai-provider/list.ts` (safe column pattern)
- Read: `packages/storage/src/local.ts`

**Outputs**:
- Modify: `packages/api/src/routers/entity-tag/attach.ts`
- Modify: `packages/api/src/routers/entity-tag/detach.ts`
- Modify: `packages/api/src/routers/full-data-export.ts`
- Modify: `packages/storage/src/local.ts`

**Validation Criteria**:
- Entity-tag attach and detach verify entity ownership before insert/delete
- Full data export does not include `encryptedApiKey` or `config` columns
- Storage `resolvePath` validates userId against path traversal
- Type check: Zero errors
- Build: Success

---

## Phase 2: Security — Input Validation & Injection

**Type**: Sequential
**Dependencies**: None (independent of Phase 1)

**Requirements**:

1. **Exchange schemas — prevent empty-string entity IDs** (`packages/api/src/routers/exchange/schemas.ts:7-9`):
   - Change `clientId: z.string().optional()` to `clientId: z.string().min(1).optional()`. Same for `projectId` and `ticketId`. This prevents `""` from passing validation and bypassing ownership checks.

2. **Lead search — escape LIKE wildcards** (`packages/api/src/routers/lead/search.ts:11`):
   - Import `escapeLikeWildcards` from `../../utils/escape-like` (pattern from `ticket/search.ts:6`).
   - Change `const pattern = \`%${input.query}%\`` to `const pattern = \`%${escapeLikeWildcards(input.query)}%\``.

3. **Project search — escape LIKE wildcards** (`packages/api/src/routers/project/search.ts:11`):
   - Same fix as lead search: import and use `escapeLikeWildcards`.

4. **Tag color — validate format** (`packages/api/src/routers/tag/schemas.ts:5,13`):
   - Change `color: z.string().optional()` to `color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex color (#RRGGBB)").optional()`.
   - Change `color: z.string().nullable().optional()` (update schema, line 13) similarly.

5. **Tag create — handle duplicate name constraint** (`packages/api/src/routers/tag/create.ts:23`):
   - Wrap the `db.insert(tags).values(row)` in a try/catch. Use the existing `isUniqueConstraintError()` helper from `packages/api/src/routers/entity-tag/attach.ts:9-16` (check for Postgres error code `23505`). On unique violation, throw `TRPCError({ code: "CONFLICT", message: "Tag with this name already exists" })`.

6. **Webhook body-size — fix chunked encoding bypass** (`apps/web/src/routes/api/webhook/$token.ts:15-30`):
   - Remove the Content-Length check (lines 15-21) since it's bypassed by chunked encoding.
   - Change `rawBody.length > MAX_BODY_BYTES` (line 25) to use byte length: `new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES`. This correctly counts bytes instead of UTF-16 code units.

**Inputs**:
- Read: `packages/api/src/routers/exchange/schemas.ts`
- Read: `packages/api/src/routers/lead/search.ts`
- Read: `packages/api/src/routers/project/search.ts`
- Read: `packages/api/src/routers/tag/schemas.ts`
- Read: `packages/api/src/routers/tag/create.ts`
- Read: `packages/api/src/routers/entity-tag/attach.ts` (for `isUniqueConstraintError` pattern)
- Read: `packages/api/src/utils/escape-like.ts`
- Read: `apps/web/src/routes/api/webhook/$token.ts`

**Outputs**:
- Modify: `packages/api/src/routers/exchange/schemas.ts`
- Modify: `packages/api/src/routers/lead/search.ts`
- Modify: `packages/api/src/routers/project/search.ts`
- Modify: `packages/api/src/routers/tag/schemas.ts`
- Modify: `packages/api/src/routers/tag/create.ts`
- Modify: `apps/web/src/routes/api/webhook/$token.ts`

**Validation Criteria**:
- `z.string().min(1)` on all three entity ID fields in exchange schemas
- `escapeLikeWildcards` used in both lead and project search
- Tag color validated as hex color format
- Tag create catches unique constraint violations with proper error
- Webhook body-size uses byte-length check
- Type check: Zero errors
- Build: Success

---

## Phase 3: Database Schema Fixes

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Remove broken `many()` relations on polymorphic tables** (`packages/db/src/schema/crm.ts:346-347, 372-373, 386-387`):
   - In `clientsRelations`: remove `tags: many(entityTags)` (line 346) and `attachments: many(attachments)` (line 347).
   - In `projectsRelations`: remove `tags: many(entityTags)` (line 372) and `attachments: many(attachments)` (line 373).
   - In `ticketsRelations`: remove `tags: many(entityTags)` (line 386) and `attachments: many(attachments)` (line 387).
   - These 6 `many()` declarations are invalid because `entityTags` and `attachments` use polymorphic `entityType`/`entityId` columns that cannot express a static FK reverse `one()` in Drizzle. They will throw at runtime when used with relational queries.
   - If the removed fields were the only fields in the relations object, remove the entire relations definition.
   - Remove unused imports of `entityTags` and `attachments` if they were only used in these `many()` calls.

2. **Fix exchanges cascade inconsistency** (`packages/db/src/schema/crm.ts:225-227`):
   - Change `exchanges.ticketId` from `onDelete: "cascade"` to `onDelete: "set null"`. This matches the pattern used by `clientId` (line 219-221) and `projectId` (line 222-224), preserving communication history when tickets are deleted.

3. **Move exchange direction enum to domain package** (`packages/db/src/schema/crm.ts:68-71`):
   - Create `EXCHANGE_DIRECTION_VALUES` constant in `packages/domain/src/` (following the pattern of other enums like `EXCHANGE_TYPE_VALUES`, `LEAD_STAGE_VALUES` etc. that are imported at lines 19-26).
   - Define it as `["incoming", "outgoing"]` to match the current values.
   - Update `crm.ts` to import from `@DCRM/domain` and use `pgEnumValues()` like all other enums in the file (lines 38-66).
   - Re-export a typed constant `EXCHANGE_DIRECTIONS` object (e.g., `{ INCOMING: "incoming", OUTGOING: "outgoing" }`) following the pattern in `packages/domain/src/ticket.ts:28-33`.

**Inputs**:
- Read: `packages/db/src/schema/crm.ts`
- Read: `packages/domain/src/index.ts` (to understand export pattern)
- Read: `packages/domain/src/ticket.ts` (enum pattern reference)
- Read: `packages/domain/src/exchange.ts` (if it exists, for exchange types)

**Outputs**:
- Modify: `packages/db/src/schema/crm.ts`
- Modify: `packages/domain/src/index.ts` (export new constant)
- Create or Modify: `packages/domain/src/exchange.ts` (add direction values)

**Validation Criteria**:
- All 6 invalid `many()` calls removed
- `exchanges.ticketId` uses `onDelete: "set null"`
- Exchange direction enum sourced from `@DCRM/domain`
- No unused imports remain
- Type check: Zero errors
- Build: Success

---

## Phase 4: Event Engine Bugs

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Fix stale "pending" return from `dispatchHooks`** (`packages/events/src/executor.ts:96-121`):
   - After the catch block updates the store (line 112-118), update the local record's status. Since `ExecutionRecord` fields are `readonly` (lines 21-34), create a new record with the updated status:
     ```typescript
     records[i] = { ...record, status: "failed" };
     ```
     Or alternatively, build a mutable copy of records and update it. The returned array must reflect the actual status.

2. **Fix dual retry desynchronization** (`packages/events/src/executor.ts:107`, `packages/events/src/queue.ts:37-43`):
   - In `HookJobData` type (`queue.ts:6-15`), the `retryCount` field is already present but always 0 at dispatch.
   - In `executor.ts` `processJob` (around line 170-179): use BullMQ's built-in attempt tracking instead of `jobData.retryCount`. BullMQ jobs have `job.attemptsMade` available. Replace `retryCount: jobData.retryCount` with `retryCount: job.attemptsMade` when constructing the `RetryPolicy`.
   - In the store update (line 176-179): write `retryCount: job.attemptsMade + 1` instead of `jobData.retryCount + 1`.
   - Remove dead code: `getRetryDelayMs` in `retry.ts:23-26` is never called. Remove it.

3. **Include hook name in `HookJobData`** (`packages/events/src/queue.ts:6-15`, `packages/events/src/executor.ts:100-109,153-162`):
   - Add `hookName: string` to `HookJobData` type.
   - In `dispatchHooks` (executor.ts ~line 100-109): include `hookName: hook.name` when constructing job data.
   - In `processJob` (executor.ts ~line 153-162): use `jobData.hookName` instead of `name: ""` when reconstructing the `HookRecord`.

4. **Fix divergent `createdAt` in `emitEvent`** (`packages/events/src/emitter.ts:87,98`):
   - Generate the timestamp before the insert: `const createdAt = new Date()`, then pass it with the row data if the schema supports it, or use the pre-generated value for both the insert and the return object.
   - If the DB schema uses `defaultNow()`, the simplest fix is to accept `createdAt` in the `EventRow` type (line 43-55) and pass it explicitly, overriding the default. This ensures the returned value matches the stored value.

**Inputs**:
- Read: `packages/events/src/executor.ts`
- Read: `packages/events/src/queue.ts`
- Read: `packages/events/src/retry.ts`
- Read: `packages/events/src/emitter.ts`
- Read: `packages/events/src/hook-resolver.ts` (for `HookRecord` type)

**Outputs**:
- Modify: `packages/events/src/executor.ts`
- Modify: `packages/events/src/queue.ts`
- Modify: `packages/events/src/retry.ts`
- Modify: `packages/events/src/emitter.ts`

**Validation Criteria**:
- `dispatchHooks` returns records with correct `status` matching the store
- Retry count uses `job.attemptsMade` from BullMQ, not hardcoded 0
- `HookJobData` includes `hookName`; `processJob` reconstructs `HookRecord` with the real name
- `emitEvent` uses the same `createdAt` for insert and return
- `getRetryDelayMs` dead code removed
- Type check: Zero errors
- Build: Success

---

## Phase 5: AI Core Bugs

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Fix insight `applied` permanently false** (`packages/ai/src/hook-executor.ts:317-345`):
   - Add an `update` method to `AIInsightStore` type (line 86-88): `readonly update: (id: string, updates: Partial<AIInsightRecord>) => Promise<void>`.
   - After the entity update succeeds and `applied = true` (line 342-345), call `await deps.insightStore.update(insightRecord.id, { applied: true })` to persist the correct value.
   - The implementation in the actual store (wherever `AIInsightStore` is instantiated) must support this method.

2. **Fix `eventType` vs `entityType` in prompt** (`packages/ai/src/hook-executor.ts:200-204`):
   - Change `input.eventType` to `input.entityType ?? extractEntityType(input.eventType)` where `extractEntityType` extracts the part before the dot (e.g., `"client.created"` → `"client"`). Or simply use `input.entityType` if the optional field is populated by callers. The key fix: do NOT pass the composite event name where the template expects an entity kind.

3. **Add error logging for entity update failures** (`packages/ai/src/hook-executor.ts:330-345`):
   - Change `catch {` to `catch (error) {` and add a `console.error("[AI hook-executor] Entity update failed:", error)`. Do NOT silently swallow the error. The function should still return `{ applied: false }` (don't re-throw), but the error must be observable.

4. **Guard `JSON.parse` against non-object types** (`packages/ai/src/hook-executor.ts:263-268`):
   - After `JSON.parse(text)`, validate the result is a plain object before casting:
     ```typescript
     const parsed = JSON.parse(text);
     if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
       structuredOutput = { raw_text: text };
     } else {
       structuredOutput = parsed as Record<string, unknown>;
     }
     ```
   - This prevents the `null` crash in `Object.entries(null)` and silent data loss from arrays/primitives.

**Inputs**:
- Read: `packages/ai/src/hook-executor.ts`

**Outputs**:
- Modify: `packages/ai/src/hook-executor.ts`
- Possibly modify: the file where `AIInsightStore` is instantiated (to add `update` method)

**Validation Criteria**:
- `AIInsightStore` has an `update` method; `applied: true` is persisted after successful entity updates
- `buildUserPrompt` receives entity type (e.g., `"client"`), not event type (e.g., `"client.created"`)
- Entity update catch block logs the error
- `JSON.parse` result validated as plain object before use
- Type check: Zero errors
- Build: Success

---

## Phase 6: Billing, Webhook Core & Storage

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Fix non-deterministic subscription query** (`packages/billing/src/subscription.ts:44-48`):
   - Add `.orderBy(desc(subscriptions.createdAt))` before `.limit(1)`. This ensures the most recent subscription is returned. Import `desc` from `drizzle-orm`.
   - Also fix the duplicate query in `packages/api/src/routers/billing/index.ts:57-61` — add the same `.orderBy(desc(subscriptions.createdAt))`.

2. **Add idempotency to Stripe customer creation** (`packages/billing/src/stripe.ts:59-73`):
   - Add an `idempotencyKey` to `stripe.customers.create()`: `{ idempotencyKey: \`customer-create-${userId}\` }`. This prevents duplicate customers on concurrent requests.

3. **Fix error swallowing in `getSubscription`** (`packages/billing/src/stripe.ts:124-131`):
   - Change the bare `catch` to distinguish error types. Import `Stripe.errors` types. If error is a `StripeInvalidRequestError` (e.g., subscription doesn't exist), return `null`. For other errors (network, auth, rate limit), log and re-throw so callers know there's an infrastructure problem.

4. **Fix billing router raw Error throws** (`packages/api/src/routers/billing/index.ts:18,35,53,65`):
   - Import `TRPCError` from `@trpc/server`.
   - Replace all `throw new Error(...)` with `TRPCError` using appropriate codes: `FORBIDDEN` for "Billing is not enabled" (lines 18, 35, 53), `NOT_FOUND` for "No Stripe customer found" (line 65).

5. **Fix webhook test/code mismatch** (`packages/webhooks/src/incoming.ts:150-156`):
   - Change `statusCode: 404` to `statusCode: 410` on line 152. The test expects 410 (Gone), which is semantically correct for a disabled webhook. The test at `packages/webhooks/__tests__/incoming.test.ts:510-517` already expects 410.

6. **Add auth mode validation in `parseConfig`** (`packages/webhooks/src/outgoing.ts:72-87`):
   - After extracting the `auth` object, validate `auth.mode` against the known valid modes. If the mode is not a recognized value, throw an error instead of falling through to the `default` branch that silently returns empty headers.

7. **Fix TOCTOU race in storage quota** (`packages/storage/src/local.ts:152-165`, `packages/storage/src/s3.ts:99-117`):
   - Wrap the quota check + write in a per-user lock. Use a simple `Map<string, Promise<void>>` as a mutex: before checking quota, acquire the lock for the userId; after write completes, release. This serializes concurrent uploads for the same user. Apply the same fix to both `local.ts` and `s3.ts`.

**Inputs**:
- Read: `packages/billing/src/subscription.ts`
- Read: `packages/billing/src/stripe.ts`
- Read: `packages/api/src/routers/billing/index.ts`
- Read: `packages/webhooks/src/incoming.ts`
- Read: `packages/webhooks/__tests__/incoming.test.ts`
- Read: `packages/webhooks/src/outgoing.ts`
- Read: `packages/storage/src/local.ts`
- Read: `packages/storage/src/s3.ts`

**Outputs**:
- Modify: `packages/billing/src/subscription.ts`
- Modify: `packages/billing/src/stripe.ts`
- Modify: `packages/api/src/routers/billing/index.ts`
- Modify: `packages/webhooks/src/incoming.ts`
- Modify: `packages/webhooks/src/outgoing.ts`
- Modify: `packages/storage/src/local.ts`
- Modify: `packages/storage/src/s3.ts`

**Validation Criteria**:
- Subscription queries include `orderBy` — deterministic results
- Stripe customer creation uses idempotency key
- `getSubscription` distinguishes error types instead of swallowing all
- Billing router throws `TRPCError` with correct HTTP codes
- Webhook disabled status returns 410 (matching test)
- `parseConfig` validates auth mode
- Storage quota check is serialized per user
- Type check: Zero errors
- Build: Success

---

## Phase 7: API Defense-in-Depth — userId Scoping & Error Handling

**Type**: Parallel

### 7.1: Write Operation userId Guards

**Requirements**:
- Add `eq(table.userId, ctx.user.id)` to the WHERE clause of all UPDATE operations that currently filter only by entity id. Each file already has a preceding ownership-gated SELECT, but the UPDATE should include userId as defense-in-depth:

  - `packages/api/src/routers/project/update.ts:65`: Add `eq(projects.userId, ctx.user.id)` to UPDATE WHERE
  - `packages/api/src/routers/project/soft-delete.ts:32`: Add `eq(projects.userId, ctx.user.id)` to UPDATE WHERE
  - `packages/api/src/routers/project/restore.ts:31`: Add `eq(projects.userId, ctx.user.id)` to UPDATE WHERE
  - `packages/api/src/routers/ticket/update.ts:64`: Add `eq(tickets.userId, ctx.user.id)` to UPDATE WHERE
  - `packages/api/src/routers/ticket/soft-delete.ts:32`: Add `eq(tickets.userId, ctx.user.id)` to UPDATE WHERE
  - `packages/api/src/routers/ticket/restore.ts:31`: Add `eq(tickets.userId, ctx.user.id)` to UPDATE WHERE
  - `packages/api/src/routers/email-account/add-authorized-address.ts:48-54`: Add `eq(clients.userId, ctx.user.id)` and `isNull(clients.deletedAt)` to UPDATE WHERE
  - `packages/api/src/routers/email-account/remove-authorized-address.ts:33-39`: Same — add userId and deletedAt to UPDATE WHERE

**Outputs**:
- Modify: `packages/api/src/routers/project/update.ts`
- Modify: `packages/api/src/routers/project/soft-delete.ts`
- Modify: `packages/api/src/routers/project/restore.ts`
- Modify: `packages/api/src/routers/ticket/update.ts`
- Modify: `packages/api/src/routers/ticket/soft-delete.ts`
- Modify: `packages/api/src/routers/ticket/restore.ts`
- Modify: `packages/api/src/routers/email-account/add-authorized-address.ts`
- Modify: `packages/api/src/routers/email-account/remove-authorized-address.ts`

**Validation**:
- All UPDATE WHERE clauses include userId check
- Type check: Zero errors

### 7.2: Error Handling & API Logic Fixes

**Requirements**:

1. **Email account — raw Error to TRPCError** (`packages/api/src/routers/email-account/add-authorized-address.ts:15,36`, `packages/api/src/routers/email-account/remove-authorized-address.ts:27`):
   - Import `TRPCError` from `@trpc/server`.
   - Replace `throw new Error("Invalid authorized address pattern...")` with `TRPCError({ code: "BAD_REQUEST", message: "..." })`.
   - Replace `throw new Error("Client not found")` with `TRPCError({ code: "NOT_FOUND", message: "Client not found" })`.

2. **Email account — wrap authorized address operations in transaction** (`packages/api/src/routers/email-account/add-authorized-address.ts`, `packages/api/src/routers/email-account/remove-authorized-address.ts`):
   - Wrap the SELECT + UPDATE sequence in `db.transaction(async (tx) => { ... })` with `.for("update")` on the SELECT to prevent concurrent read-modify-write races. Follow the pattern in `packages/api/src/routers/import/import-clients.ts:54`.

3. **Lead update — add soft-delete guard** (`packages/api/src/routers/lead/update.ts:17-21`):
   - Add `isNull(leads.deletedAt)` to the WHERE clause of the ownership-gating SELECT query. Every other mutation in this router includes it.

4. **Lead list schema — validate date fields** (`packages/api/src/routers/lead/schemas.ts:49,53-54`):
   - Change `cursor: z.string().optional()` to `cursor: z.string().datetime().optional()`. Same for `dateFrom` and `dateTo`. Follow the pattern from `packages/api/src/routers/exchange/schemas.ts:32-33`.

5. **Ticket upcoming-deadlines — use domain constants** (`packages/api/src/routers/ticket/upcoming-deadlines.ts:25`):
   - Import `TICKET_STATUSES` from `@DCRM/domain`.
   - Replace `["open", "in_progress"]` with `[TICKET_STATUSES.OPEN, TICKET_STATUSES.IN_PROGRESS]`.

6. **send-email recipient — add userId scoping** (`packages/api/src/routers/exchange/send-email.ts:62,70,77,90,143-148`):
   - Add `eq(table.userId, ctx.user.id)` to the WHERE clauses of ticket (line 62), project (line 70), and both client lookups (lines 77, 90). This is defense-in-depth — the entities are reached through FK chains from a user-owned exchange.

7. **resolveEntityIdsByTags — add userId scoping** (`packages/api/src/routers/search/global.ts:49-65`):
   - Add `userId` parameter to the function. Join `entityTags` with `tags` table and add `eq(tags.userId, userId)` to filter. This prevents cross-tenant tag resolution.

8. **Webhook list — filter by type in SQL** (`packages/api/src/routers/webhook/list.ts:20,23-24`):
   - Add `eq(hooks.type, "outgoing_webhook")` to the SQL WHERE clause. Remove the JavaScript `.filter()` on line 23-24. Import `HOOK_TYPES` from the domain/constants and use the constant.

9. **authMode dead code — remove from webhook schemas** (`packages/api/src/routers/webhook/schemas.ts:13,57`):
   - Remove the `authMode` field from both `createOutgoingWebhookSchema` and `updateOutgoingWebhookSchema`. It is never read by any handler — `authConfig` is the sole source of truth. This eliminates the contradictory default (`"custom_headers"` vs `{ mode: "none" }`).

10. **accept-insight — remove needless transaction, fix premature applied** (`packages/api/src/routers/hook/accept-insight.ts:41-46`):
    - Remove the `db.transaction()` wrapper since it contains only a single UPDATE.
    - Note: the `applied: true` is set without actually applying fields to an entity. This mirrors the AI core bug (Phase 5). The fix here is to NOT mark `applied: true` until the caller confirms the fields were applied. For now, rename the field to `acceptedAt` and keep `applied` as the entity-write confirmation. If this is too complex for this phase, at minimum add a code comment documenting the known gap.

**Outputs**:
- Modify: `packages/api/src/routers/email-account/add-authorized-address.ts`
- Modify: `packages/api/src/routers/email-account/remove-authorized-address.ts`
- Modify: `packages/api/src/routers/lead/update.ts`
- Modify: `packages/api/src/routers/lead/schemas.ts`
- Modify: `packages/api/src/routers/ticket/upcoming-deadlines.ts`
- Modify: `packages/api/src/routers/exchange/send-email.ts`
- Modify: `packages/api/src/routers/search/global.ts`
- Modify: `packages/api/src/routers/webhook/list.ts`
- Modify: `packages/api/src/routers/webhook/schemas.ts`
- Modify: `packages/api/src/routers/hook/accept-insight.ts`

**Validation**:
- All Error throws replaced with TRPCError
- Authorized address operations wrapped in transaction with row lock
- Lead update checks deletedAt
- Lead date fields validated as datetime
- Ticket uses domain constants
- send-email recipients scoped by userId
- Tag resolution scoped by userId
- Webhook list filters by type in SQL
- authMode removed from webhook schemas
- Type check: Zero errors

**Phase-level Validation**:
- All sub-phases pass individual validation
- No circular imports introduced
- Type check: Zero errors across all files
- Build: Success

**Dependencies**: None

---

## Phase 8: Web App — Critical Navigation & Form Bugs

**Type**: Parallel

### 8.1: Global Search Navigation

**Requirements**:

1. **Exchange search — use correct entity ID for navigation** (`apps/web/src/components/global-search.tsx:85-86`):
   - The `SearchResultItem` (from `packages/api/src/routers/search/schemas.ts:73-80`) has no `parentId` field. The exchange case currently navigates to `/clients/$clientId` with the exchange's own ID.
   - Fix: change the exchange case to navigate to `/clients/$clientId` only if the exchange has a `clientId` in its data. If no clientId, navigate to the exchanges list or show a message. The `item` object needs to carry a reference to its parent entity. Check the search API response shape to determine what fields are available. At minimum, remove the broken navigation — navigate to `/exchanges` (or the appropriate list) instead of passing a wrong ID.

2. **Ticket search — navigate to specific ticket** (`apps/web/src/components/global-search.tsx:82-83`):
   - Change from `navigate({ to: "/tickets/", params: {} })` to `navigate({ to: "/projects/$projectId/tickets/$ticketId", params: { projectId: item.projectId ?? "", ticketId: entityId } })`. The search API must provide `projectId` for this to work. Check `SearchResultItem` schema. If `projectId` is not available in the search result, add it to the API response shape in `packages/api/src/routers/search/` and update the schema accordingly.

**Outputs**:
- Modify: `apps/web/src/components/global-search.tsx`
- Possibly modify: `packages/api/src/routers/search/schemas.ts` (add fields)
- Possibly modify: search result building in `packages/api/src/routers/search/global.ts`

**Validation**:
- Exchange search no longer passes wrong ID
- Ticket search navigates to specific ticket detail page
- Type check: Zero errors

### 8.2: Form Date Handling & Optional Field Clearing

**Requirements**:

1. **Fix empty-string dates in create forms** (`apps/web/src/routes/projects/create.tsx:64`, `apps/web/src/routes/projects/index.tsx:174`, `apps/web/src/routes/tickets/create.tsx:72`):
   - Before calling `createMutation.mutate(values)`, clean empty strings from date fields:
     - `values.startDate || undefined` instead of raw `values.startDate`
     - `values.endDate || undefined` instead of raw `values.endDate`
     - `values.dueDate || undefined` instead of raw `values.dueDate`
   - Follow the pattern already used in edit forms (e.g., `$projectId.edit.tsx` which does `values.startDate || undefined`).

2. **Fix optional field clearing** (`apps/web/src/lib/forms/client-form-schema.ts:5`):
   - The `emptyStringToUndefined` transform converts `""` → `undefined`, but the API needs `null` to mean "clear this field" and `undefined` to mean "don't change."
   - Change the transform to map `""` → `null` instead of `undefined`: `z.string().transform((v) => (v === "" ? null : v)).optional().nullable()`. This ensures clearing a field sends `null` to the API, which the API already handles correctly.

3. **Fix lead form schema — add empty-string transform** (`apps/web/src/lib/forms/lead-form-schema.ts:38-43`):
   - Add the same `emptyStringToUndefined` or `emptyStringToNull` pattern to `email`, `phone`, `company`, and other optional string fields. Make it consistent with `client-form-schema.ts`.

4. **Fix misleading conversion toast** (`apps/web/src/routes/leads/$leadId.convert.tsx:33-38`):
   - Change `toast.error("Conversion succeeded but no client was created")` to `toast.error("Conversion failed. The lead may not be in 'won' stage or has already been converted.")`. The server returns `null` for all failure cases — the message should reflect failure, not partial success.

5. **Fix hardcoded `"won"` string** (`apps/web/src/routes/leads/$leadId.convert.tsx:71`):
   - Import `LEAD_STAGES` from `@DCRM/domain` and replace `"won"` with `LEAD_STAGES.WON`.

**Outputs**:
- Modify: `apps/web/src/routes/projects/create.tsx`
- Modify: `apps/web/src/routes/projects/index.tsx`
- Modify: `apps/web/src/routes/tickets/create.tsx`
- Modify: `apps/web/src/lib/forms/client-form-schema.ts`
- Modify: `apps/web/src/lib/forms/lead-form-schema.ts`
- Modify: `apps/web/src/routes/leads/$leadId.convert.tsx`

**Validation**:
- Creating projects/tickets with empty date fields succeeds (no API validation error)
- Clearing optional fields in edit forms sends `null` to API
- Lead form schema consistent with client form schema
- Conversion toast accurately describes failure
- No hardcoded stage strings
- Type check: Zero errors

**Phase-level Validation**:
- All sub-phases pass individual validation
- Integration: search results navigate to correct pages
- Type check: Zero errors
- Build: Success

**Dependencies**: None

---

## Phase 9: Web App — Auth, UI & Accessibility

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Login page — redirect authenticated users** (`apps/web/src/routes/login.tsx:7-9`):
   - Add a `beforeLoad` guard that redirects to `/dashboard` if the user is already authenticated. Follow the pattern from `apps/web/src/routes/index.tsx` or `_authenticated.tsx`. Example:
     ```typescript
     export const Route = createFileRoute("/login")({
       beforeLoad: ({ context }) => {
         if (context.auth?.isAuthenticated) {
           throw redirect({ to: "/dashboard" });
         }
       },
       component: RouteComponent,
     });
     ```

2. **Delete confirmation dialogs** (`apps/web/src/routes/projects/$projectId.tsx:119-126`, `apps/web/src/routes/projects/$projectId/tickets/$ticketId.tsx:126-132`):
   - Wrap the delete mutation in a confirmation. Use `window.confirm("Are you sure you want to delete this project/ticket?")` before calling `softDeleteMutation.mutate()`. Alternatively, use a shadcn AlertDialog component if one exists in the UI package.

3. **AI chat — safe parse instead of throwing parse** (`apps/web/src/components/ai-chat.tsx:61-69`):
   - Replace `messageRoleSchema.parse(m.role)` with `messageRoleSchema.safeParse(m.role)`.
   - If `safeParse` fails, default to `"system"` role or skip the message. Do NOT throw during render.
   - Move the schema definition outside the component body to avoid recreation on every render.

4. **Loader — add accessibility** (`apps/web/src/components/loader.tsx:3-9`):
   - Add `role="status"` and an accessible label:
     ```tsx
     <div role="status" aria-label="Loading" className="flex h-full items-center justify-center pt-8">
       <Loader2 className="animate-spin" aria-hidden="true" />
       <span className="sr-only">Loading...</span>
     </div>
     ```

5. **Sign-out error handling** (`apps/web/src/components/user-menu.tsx:42-55`):
   - Add an `onError` callback to `authClient.signOut()`:
     ```typescript
     onError: () => {
       toast.error("Failed to sign out. Please try again.");
     },
     ```

6. **useNavigate `from` route fix** (`apps/web/src/components/sign-in-form.tsx:14-15`, `apps/web/src/components/sign-up-form.tsx:14-15`):
   - Change `useNavigate({ from: "/" })` to `useNavigate({ from: "/login" })` in both files.

7. **Dashboard — fix negative-day display** (`apps/web/src/routes/dashboard.tsx:44-55`):
   - Add a condition for overdue dates before the existing `diffDays < 7` check:
     ```typescript
     if (diffDays < 0) {
       const absDays = Math.abs(diffDays);
       if (absDays === 1) return "1 day overdue";
       return `${absDays} days overdue`;
     }
     ```
   - This prevents confusing "-3 days" display for overdue items.

8. **Ticket detail — fix unsafe type cast** (`apps/web/src/routes/projects/$projectId/tickets/$ticketId.tsx:19-30,77`):
   - Change `Date | null` to `string | null` in the local `TicketData` type for `dueDate`, `createdAt`, `deletedAt`. Remove the `as TicketData | null` cast. Use `new Date()` at the specific usage sites (lines 147, 150) which already do this.

9. **Kanban stage buttons — disable during mutation** (`apps/web/src/routes/leads/index.tsx:256-297`):
   - Pass `disabled={isPending}` to `StageMoveButtons` and apply it to each `<Button>`. The `stageUpdateMutation.isPending` is available in the parent scope — pass it as a prop.

10. **Remove unused clientId prop** (`apps/web/src/routes/clients/$clientId.edit.tsx:95-121`):
    - Remove `clientId` from `EditClientForm` props and the `void clientId` suppression. Remove the `clientId={clientId}` prop at the call site (line 84). If the form needs the ID for the mutation, it already receives it via `onSubmit`.

**Inputs**:
- Read: `apps/web/src/routes/login.tsx`
- Read: `apps/web/src/routes/index.tsx` (for redirect pattern)
- Read: `apps/web/src/routes/projects/$projectId.tsx`
- Read: `apps/web/src/routes/projects/$projectId/tickets/$ticketId.tsx`
- Read: `apps/web/src/components/ai-chat.tsx`
- Read: `apps/web/src/components/loader.tsx`
- Read: `apps/web/src/components/user-menu.tsx`
- Read: `apps/web/src/components/sign-in-form.tsx`
- Read: `apps/web/src/components/sign-up-form.tsx`
- Read: `apps/web/src/routes/dashboard.tsx`
- Read: `apps/web/src/routes/leads/index.tsx`
- Read: `apps/web/src/routes/clients/$clientId.edit.tsx`

**Outputs**:
- Modify: `apps/web/src/routes/login.tsx`
- Modify: `apps/web/src/routes/projects/$projectId.tsx`
- Modify: `apps/web/src/routes/projects/$projectId/tickets/$ticketId.tsx`
- Modify: `apps/web/src/components/ai-chat.tsx`
- Modify: `apps/web/src/components/loader.tsx`
- Modify: `apps/web/src/components/user-menu.tsx`
- Modify: `apps/web/src/components/sign-in-form.tsx`
- Modify: `apps/web/src/components/sign-up-form.tsx`
- Modify: `apps/web/src/routes/dashboard.tsx`
- Modify: `apps/web/src/routes/leads/index.tsx`
- Modify: `apps/web/src/routes/clients/$clientId.edit.tsx`

**Validation Criteria**:
- Authenticated users are redirected from `/login`
- Delete actions require confirmation
- AI chat does not crash on unexpected message roles
- Loader has `role="status"` and accessible label
- Sign-out shows error toast on failure
- `useNavigate` uses correct `from` route
- Overdue dates show "N days overdue" not "-N days"
- Ticket detail types are accurate (string not Date)
- Kanban buttons disabled during mutation
- No `void` suppression for unused props
- Type check: Zero errors
- Build: Success

---

## Phase 10: Native App Fixes

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Dashboard stats — use count endpoint or total field** (`apps/native/app/(tabs)/index.tsx:17-28,67-82`):
   - Instead of `limit: 1` and `items.length`, use the API's `total` field from the list response (most list endpoints return `{ items, total }`). Display `clients.data?.total ?? 0` instead of `clients.data?.items.length ?? 0`. If the API doesn't return `total`, remove the `limit: 1` and use the full item count, or add a dedicated count query.

2. **Detail pages — add `enabled: !!id` to queries** (`apps/native/app/client/[id].tsx:14-16`, `apps/native/app/project/[id].tsx:15-17`, `apps/native/app/ticket/[id].tsx:15-17`, `apps/native/app/exchange/[id].tsx:12-14`):
   - Add `enabled: !!id` to each `useQuery` options to prevent queries firing with empty-string IDs.

3. **Extract shared `getErrorMessage` utility** (`apps/native/app/sign-in.tsx:24-49`, `apps/native/app/sign-up.tsx:25-50`):
   - Create `apps/native/lib/get-error-message.ts` with the shared function.
   - Import and use in both `sign-in.tsx` and `sign-up.tsx`. Remove the duplicated definitions.

4. **Extract shared `DetailRow` component** (`apps/native/app/client/[id].tsx:141-162`, `apps/native/app/project/[id].tsx:156-176`):
   - Create `apps/native/components/detail-row.tsx` with a unified component that accepts a `hideIfEmpty?: boolean` prop to handle both behaviors (client returns null for falsy, project always renders). Import and use in both detail pages.

5. **Create-ticket — handle pre-selected non-active project** (`apps/native/app/create-ticket.tsx:27-29,36-39,93`):
   - If `selectedProjectId` is set but the project is not in the fetched list, show the project name from navigation params (add `projectName` to the route params) or make a separate `read` query for the specific project. At minimum, show the ID or "Unknown Project" instead of "Change".

6. **Scope `invalidateQueries` calls** — all 8 mutation handlers call `queryClient.invalidateQueries()` without filters:
   - `apps/native/app/create-client.tsx:43`: `invalidateQueries({ queryKey: ["client"] })` or use the tRPC query key pattern
   - `apps/native/app/create-project.tsx:41`: `invalidateQueries({ queryKey: ["project"] })`
   - `apps/native/app/create-ticket.tsx:52`: `invalidateQueries({ queryKey: ["ticket"] })`
   - `apps/native/app/create-exchange.tsx:56`: `invalidateQueries({ queryKey: ["exchange"] })`
   - `apps/native/app/client/[id].tsx:46,59`: `invalidateQueries({ queryKey: ["client"] })`
   - `apps/native/app/project/[id].tsx:47`: `invalidateQueries({ queryKey: ["project"] })`
   - `apps/native/app/ticket/[id].tsx:47`: `invalidateQueries({ queryKey: ["ticket"] })`
   - `apps/native/app/(tabs)/index.tsx:122`: `invalidateQueries()` — this one can stay broad since it's the dashboard
   - Use the appropriate tRPC query key pattern from the project's tRPC setup. The goal is to avoid refetching all queries on every mutation.

7. **Remove unused import** (`apps/native/app/exchange/[id].tsx:3`):
   - Remove `useThemeColor` from the import since it's never called.

**Inputs**:
- Read: `apps/native/app/(tabs)/index.tsx`
- Read: `apps/native/app/client/[id].tsx`
- Read: `apps/native/app/project/[id].tsx`
- Read: `apps/native/app/ticket/[id].tsx`
- Read: `apps/native/app/exchange/[id].tsx`
- Read: `apps/native/app/sign-in.tsx`
- Read: `apps/native/app/sign-up.tsx`
- Read: `apps/native/app/create-client.tsx`
- Read: `apps/native/app/create-project.tsx`
- Read: `apps/native/app/create-ticket.tsx`
- Read: `apps/native/app/create-exchange.tsx`

**Outputs**:
- Modify: `apps/native/app/(tabs)/index.tsx`
- Modify: `apps/native/app/client/[id].tsx`
- Modify: `apps/native/app/project/[id].tsx`
- Modify: `apps/native/app/ticket/[id].tsx`
- Modify: `apps/native/app/exchange/[id].tsx`
- Modify: `apps/native/app/sign-in.tsx`
- Modify: `apps/native/app/sign-up.tsx`
- Modify: `apps/native/app/create-client.tsx`
- Modify: `apps/native/app/create-project.tsx`
- Modify: `apps/native/app/create-ticket.tsx`
- Modify: `apps/native/app/create-exchange.tsx`
- Create: `apps/native/lib/get-error-message.ts`
- Create: `apps/native/components/detail-row.tsx`

**Validation Criteria**:
- Dashboard shows real counts (not 0/1)
- Detail page queries don't fire with empty IDs
- `getErrorMessage` and `DetailRow` extracted to shared modules
- Pre-selected non-active project handled gracefully
- `invalidateQueries` scoped to relevant query keys
- Unused import removed
- Type check: Zero errors
- Build: Success

---

## Phase 11: Email, i18n, Onboarding & Attachment Packages

**Type**: Sequential
**Dependencies**: None

**Requirements**:

1. **Email config — fix `this` binding** (`packages/email/src/config.ts:136-152`):
   - In `encryptAccount` and `decryptAccount` methods, replace `this.encryptImap`/`this.decryptImap`/`this.encryptSmtp`/`this.decryptSmtp` with references through the object literal. Capture `const config = this` or destructure into local variables before the methods, or convert the methods to arrow functions. The goal: make these methods safe for destructuring.

2. **Email sync — add messageId deduplication** (`packages/email/src/imap-sync.ts:277-309`):
   - Before calling `createExchange`, check if an exchange with the same `messageId` already exists for this user. Add a deduplication query or pass a unique constraint check. This prevents duplicate exchanges on retry after partial failure.

3. **Email linkUnmatchedEmail — atomic conditional update** (`packages/email/src/unmatched.ts:122,138-171`):
   - Change the `markAsLinked` call to use a conditional UPDATE: `WHERE id = ? AND linkedEntityId IS NULL`. If the update affects 0 rows, the record was already linked — return a "already linked" result instead of proceeding. This eliminates the TOCTOU race.

4. **i18n test — fix dictionary corruption** (`packages/i18n/__tests__/i18n.test.ts:110-113`):
   - Save the original dictionary before the test: `const original = i18n.getDict("en")` (or equivalent API). After the test, restore it with `i18n.registerTranslations("en", original)` using the correct dictionary. Alternatively, mock/spy the dictionaries Map.

5. **i18n createI18n — fix global mutation** (`packages/i18n/src/i18n.ts:71-73,96`):
   - The `createI18n` return object should NOT reference the module-scope `registerTranslations`. Instead, create a per-instance dictionaries Map and use that for the instance's `t` function. Only the singleton `i18n` export should use the shared global dictionaries.

6. **Webhook form schema — fix secret validation trap** (`apps/web/src/lib/forms/incoming-webhook-form-schema.ts:7`):
   - Change `z.union([z.string().min(8), z.literal(undefined)])` to `z.union([z.string().min(8), z.literal("")])` or use `.transform()` to convert `""` back to `undefined` before validation. The user should be able to clear the field.

7. **Onboarding email-setup — fix Continue button** (`apps/web/src/routes/onboarding/email-setup.tsx:70-77`):
   - Change the "Continue" `Link` from `to="/onboarding"` to `to="/onboarding/complete"` or `to="/dashboard"`. Navigating to `/onboarding` resets the wizard to step 1. After email setup, the user should advance to the next logical step or complete onboarding.

8. **Non-atomic attachment delete — reverse order** (`packages/api/src/routers/attachment/delete.ts:28-38`):
   - Reverse the order: delete storage file first, then delete the DB row. Wrap storage delete in try/catch: if the file is already gone (StorageError NOT_FOUND), proceed with DB deletion anyway. If storage delete fails for other reasons, still delete the DB row but log the error. This prevents orphaned files.

9. **Non-atomic event emission in webhook** (`packages/webhooks/src/incoming.ts:253-255`):
   - This is noted but fixing requires transaction-aware event persister infrastructure. For now, add a code comment documenting the known non-atomicity gap. Full fix is deferred to a future iteration.

**Inputs**:
- Read: `packages/email/src/config.ts`
- Read: `packages/email/src/imap-sync.ts`
- Read: `packages/email/src/unmatched.ts`
- Read: `packages/i18n/__tests__/i18n.test.ts`
- Read: `packages/i18n/src/i18n.ts`
- Read: `apps/web/src/lib/forms/incoming-webhook-form-schema.ts`
- Read: `apps/web/src/routes/onboarding/email-setup.tsx`
- Read: `packages/api/src/routers/attachment/delete.ts`
- Read: `packages/webhooks/src/incoming.ts`

**Outputs**:
- Modify: `packages/email/src/config.ts`
- Modify: `packages/email/src/imap-sync.ts`
- Modify: `packages/email/src/unmatched.ts`
- Modify: `packages/i18n/__tests__/i18n.test.ts`
- Modify: `packages/i18n/src/i18n.ts`
- Modify: `apps/web/src/lib/forms/incoming-webhook-form-schema.ts`
- Modify: `apps/web/src/routes/onboarding/email-setup.tsx`
- Modify: `packages/api/src/routers/attachment/delete.ts`
- Modify: `packages/webhooks/src/incoming.ts` (add comment)

**Validation Criteria**:
- `encryptAccount`/`decryptAccount` safe for destructuring
- Email sync prevents duplicate exchanges via messageId
- `linkUnmatchedEmail` uses atomic conditional update
- i18n test restores original dictionary correctly
- `createI18n` has isolated state
- Webhook secret field accepts empty string (user can clear it)
- Onboarding Continue advances instead of resetting
- Attachment delete is resilient to storage failures
- Type check: Zero errors
- Build: Success

---

## Phase 12: Test Fixes

**Type**: Sequential
**Dependencies**: Phase 7 (test mocks must match the updated API code)

**Requirements**:

1. **Lead convert test — add transaction mock** (`packages/api/__tests__/lead/procedures.test.ts:60-122`):
   - Add `transaction: vi.fn((fn) => fn({ insert: vi.fn(), select: vi.fn(() => new Proxy({}, { ... })), update: vi.fn(() => new Proxy({}, { ... })) }))` to the mock `db` object.
   - The transaction callback receives a `tx` object that must support `tx.select()`, `tx.insert()`, `tx.update()`, and `.for("update")` chainable. Use the same Proxy pattern as the existing `select` and `update` mocks.
   - Verify all 4 convert test cases can execute without `TypeError`.

2. **Client import test — add transaction mock** (`packages/api/__tests__/client/procedures.test.ts:38-46`):
   - Same fix: add `transaction` to the mock `db` object. The `import-clients.ts` handler calls `db.transaction(async (tx) => { ... })` with `tx.insert()`. Add appropriate mock support.
   - Verify all 5 `importClients` test cases can execute without `TypeError`.

**Inputs**:
- Read: `packages/api/__tests__/lead/procedures.test.ts`
- Read: `packages/api/__tests__/client/procedures.test.ts`
- Read: `packages/api/src/routers/lead/convert.ts` (to understand transaction usage)
- Read: `packages/api/src/routers/import/import-clients.ts` (to understand transaction usage)

**Outputs**:
- Modify: `packages/api/__tests__/lead/procedures.test.ts`
- Modify: `packages/api/__tests__/client/procedures.test.ts`

**Validation Criteria**:
- Both test files have `transaction` method in mock `db`
- Transaction mock supports chained calls (`tx.select()`, `tx.insert()`, `tx.update()`, `.for()`)
- Tests execute without TypeError
- Type check: Zero errors
- Build: Success

---

## Deferred Items (Not Included in Fix Plan)

These findings are acknowledged but deferred because they require product decisions, significant new features, or have very low practical impact:

| Finding | Report | Reason for Deferral |
|---------|--------|-------------------|
| Missing "waiting" ticket status | R4-F2 | Needs product decision on PRD v2 vs v3 values |
| "urgent" vs "critical" priority naming | R4-F3 | Semantic equivalent; PRD v3 uses "urgent" |
| Stripe webhook handler unreachable | R20-F4 | Requires new API route file — feature, not bug fix |
| Upload mutation never stores file data | R26-F3 | Requires significant new implementation (file upload flow) |
| Stripe webhook `handleWebhook` endpoint | R20-F4 | Needs new TanStack Start API route to bridge raw HTTP |
| `accept-insight` premature `applied:true` without entity write | R20-F5 | Design decision needed on accept vs apply semantics |

---

## Success Criteria

- All 71 confirmed findings addressed or explicitly deferred
- Gatekeeping commands pass: `pnpm check-types` → zero errors, `pnpm build` → success
- No new issues introduced
- All phases validate independently
- Security findings (authorization bypasses, path traversal, data exposure) fixed in Phase 1
- Critical runtime bugs (stale records, wrong IDs, broken forms) fixed in Phases 3-8
