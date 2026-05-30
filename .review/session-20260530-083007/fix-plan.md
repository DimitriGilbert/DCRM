# Fix Plan - DCRM2 Review

## Overview

This plan addresses **70 confirmed findings** across 35 verified review reports, covering security vulnerabilities, data integrity bugs, logic errors, and UX issues. Findings are organized into 8 phases prioritized by severity: critical data loss first, then security, database schema, core engines, API routers, and finally frontend.

**Dismissed findings excluded**: Report 17 Finding 1 (readProject returns soft-deleted — intentional design), Report 17 Finding 2 (updateProject mutates soft-deleted — consistent codebase pattern).

## Prerequisites

- pnpm via corepack
- TypeScript strict mode enabled
- Drizzle ORM for database operations
- Zod 4 for validation schemas

## Gatekeeping Commands

- Type check: `pnpm check-types`
- Build: `pnpm build`

---

## Phase 1: Critical Data Loss & Security Bugs

**Type**: Sequential
**Dependencies**: None

These are the most severe bugs causing silent data loss, broken features, or authorization bypass.

**Requirements**:

1. **[Report 24.1 — CRITICAL]** Fix email account update mutation using wrong column names in `.set()`.
   - File: `packages/api/src/routers/email-account/update.ts:33-93`
   - Replace `Record<string, unknown>` with a properly typed partial object
   - Change all snake_case keys (`sync_enabled`, `sync_interval`, `encrypted_imap_host`, etc.) to camelCase property names (`syncEnabled`, `syncInterval`, `encryptedImapHost`, etc.)
   - Only `email` and `updatedAt` are currently correct

2. **[Report 21.1 — CRITICAL]** Fix `detach.ts` authorization bypass — missing userId ownership check.
   - File: `packages/api/src/routers/entity-tag/detach.ts:10-35`
   - Add `ctx` to destructured parameters: `async ({ ctx, input })` (currently only `({ input })`)
   - Join to `tags` table and filter by `ctx.user.id` in both the SELECT and DELETE queries
   - Follow the pattern from `attach.ts:11-18`

3. **[Report 22.1 — CRITICAL]** Fix full data export entityTags query comparing `tagId` to `userId`.
   - File: `packages/api/src/routers/export/full-data-export.ts:54`
   - Replace `eq(entityTags.tagId, userId)` with `inArray(entityTags.tagId, tagsData.map(t => t.id))`
   - Remove `.catch(() => [])` which silently swallows errors

4. **[Report 23.1 — CRITICAL]** Fix broken `unreadOnly` filter using `isNull` on NOT NULL column.
   - File: `packages/api/src/routers/notification/list.ts:14`
   - Replace `isNull(notifications.read)` with `eq(notifications.read, false)`
   - The `read` column is `boolean().notNull().default(false)` — it can never be NULL

5. **[Report 16.1 + 16.2 — CRITICAL/HIGH]** Make lead conversion atomic and add race condition protection.
   - File: `packages/api/src/routers/lead/convert.ts`
   - Wrap the entire conversion (insert client + update lead + update attachments) in `db.transaction()`
   - Add `.for("update")` row-level lock on the lead SELECT to prevent concurrent conversion
   - Check `convertedClientId` inside the transaction after lock

**Inputs**:
- Read: `packages/api/src/routers/email-account/update.ts`
- Read: `packages/api/src/routers/entity-tag/detach.ts`
- Read: `packages/api/src/routers/entity-tag/attach.ts` (reference for correct pattern)
- Read: `packages/api/src/routers/export/full-data-export.ts`
- Read: `packages/api/src/routers/notification/list.ts`
- Read: `packages/api/src/routers/lead/convert.ts`
- Read: `packages/db/src/schema/automation.ts` (for column references)
- Read: `packages/db/src/schema/crm.ts` (for column references)

**Outputs**:
- Modify: `packages/api/src/routers/email-account/update.ts`
- Modify: `packages/api/src/routers/entity-tag/detach.ts`
- Modify: `packages/api/src/routers/export/full-data-export.ts`
- Modify: `packages/api/src/routers/notification/list.ts`
- Modify: `packages/api/src/routers/lead/convert.ts`

**Validation Criteria**:
- Email account update correctly persists credential changes (camelCase keys)
- Entity tag detach checks userId ownership before deleting
- Full data export includes entity-tag associations
- Notification list with `unreadOnly: true` returns unread notifications
- Lead conversion is atomic — partial failure rolls back all changes
- Type check: `pnpm check-types` passes with zero errors

---

## Phase 2: Docker & Infrastructure Security

**Type**: Sequential
**Dependencies**: None (can run in parallel with Phase 1)

**Requirements**:

1. **[Report 3.1 — CRITICAL]** Fix Dockerfile missing 8 workspace packages.
   - File: `Dockerfile` (lines 9-15 deps stage, lines 20-28 build stage)
   - Add COPY lines for missing packages: `ai/`, `billing/`, `crypto/`, `domain/`, `email/`, `events/`, `storage/`, `webhooks/`
   - Add corresponding COPY lines for source code in the build stage
   - Also check if `i18n/` is needed as a transitive dependency

2. **[Report 3.2 — HIGH]** Fix healthcheck using `curl` not available in slim image.
   - File: `docker-compose.yml` line 20
   - Replace `curl -sf http://localhost:3001/robots.txt || exit 1` with `node -e "fetch('http://localhost:3001/robots.txt').then(r => { process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"`
   - Or use `wget` which is sometimes available, or install `curl` in the production stage

3. **[Report 3.3 — HIGH]** Secure Postgres and Redis ports in docker-compose.
   - File: `docker-compose.yml`
   - Remove `ports:` mappings for both Postgres (5432) and Redis (6379) or use `127.0.0.1:5432:5432` / `127.0.0.1:6379:6379` to bind to localhost only
   - Add `--requirepass` to Redis command
   - Change default Postgres password to something stronger

4. **[Report 3.4 — MEDIUM]** Add S3 env cross-field validation when `STORAGE_TYPE=s3`.
   - File: `packages/env/src/server.ts:23-30`
   - Add `.refine()` to the server env schema that requires `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` when `STORAGE_TYPE === "s3"`
   - Or use Zod `.superRefine()` on the full object

5. **[Report 20.5 — MEDIUM]** Fix storage env vars bypassing `@DCRM/env` validation.
   - Files: `packages/api/src/routers/attachment/download.ts:34`, `packages/api/src/routers/attachment/delete.ts:35`
   - Replace `process.env.STORAGE_TYPE as "local" | "s3"` with import from `@DCRM/env/server`
   - Use the validated `env` object instead of raw `process.env`

**Inputs**:
- Read: `Dockerfile`
- Read: `docker-compose.yml`
- Read: `packages/env/src/server.ts`
- Read: `packages/api/src/routers/attachment/download.ts`
- Read: `packages/api/src/routers/attachment/delete.ts`
- Read: `packages/storage/src/storage.ts` (reference for storage config)

**Outputs**:
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `packages/env/src/server.ts`
- Modify: `packages/api/src/routers/attachment/download.ts`
- Modify: `packages/api/src/routers/attachment/delete.ts`

**Validation Criteria**:
- `docker build .` succeeds with all workspace packages
- Healthcheck works in production image
- Postgres/Redis not exposed on host network (or bound to localhost only)
- Setting `STORAGE_TYPE=s3` without required fields fails at startup
- Type check: `pnpm check-types` passes with zero errors

---

## Phase 3: Database Schema Constraints & Migration

**Type**: Sequential
**Dependencies**: None (can run in parallel with Phases 1-2)

**Requirements**:

1. **[Report 1.1 — HIGH]** Add unique constraint on `emailSyncState (emailAccountId, folder)`.
   - File: `packages/db/src/schema/automation.ts:301-320`
   - Add `uniqueIndex("email_sync_state_account_folder_idx").on(table.emailAccountId, table.folder)` to the indexes array

2. **[Report 1.2 — MEDIUM]** Add unique constraint on `emailAccounts (userId, email)`.
   - File: `packages/db/src/schema/automation.ts:271-299`
   - Add `uniqueIndex("email_accounts_user_email_idx").on(table.userId, table.email)` to the indexes array

3. **[Report 1.3 — MEDIUM]** Generate migration for missing automation tables, enums, and `authorized_addresses` column.
   - Run `pnpm --filter @DCRM/db drizzle-kit generate` to create a new migration file
   - Verify the new migration includes all 13 automation tables, all automation enums, and the `authorized_addresses` column on `clients`

4. **[Report 12.1 — HIGH]** Add unique constraint on `subscriptions.stripeSubscriptionId`.
   - File: `packages/db/src/schema/automation.ts:364-389`
   - Add `uniqueIndex("subscriptions_stripe_sub_id_idx").on(table.stripeSubscriptionId)` to the indexes array
   - Then update `packages/billing/src/subscription.ts:107-129` to use `onConflictDoUpdate` instead of SELECT-then-INSERT/UPDATE

5. **[Report 20.8 — MEDIUM]** Add `.notNull()` to `fileSize` and `mimeType` columns in attachments table.
   - File: `packages/db/src/schema/crm.ts:302-303`
   - Change `fileSize: integer("file_size")` to `fileSize: integer("file_size").notNull()`
   - Change `mimeType: text("mime_type")` to `mimeType: text("mime_type").notNull()`

**Inputs**:
- Read: `packages/db/src/schema/automation.ts`
- Read: `packages/db/src/schema/crm.ts`
- Read: `packages/billing/src/subscription.ts`
- Read: `packages/db/src/migrations/meta/_journal.json`

**Outputs**:
- Modify: `packages/db/src/schema/automation.ts`
- Modify: `packages/db/src/schema/crm.ts`
- Modify: `packages/billing/src/subscription.ts`
- Create: New migration file in `packages/db/src/migrations/`

**Validation Criteria**:
- All new unique constraints are defined in schema
- New migration file generated and covers all missing tables/columns
- `onConflictDoUpdate` used in billing subscription upsert
- Type check: `pnpm check-types` passes with zero errors

---

## Phase 4: Core Package Engine Bugs

**Type**: Parallel (sub-phases touch different packages)
**Dependencies**: None (independent of API and frontend)

### Sub-phase 4A: Auth Package

**Requirements**:

1. **[Report 2.1 — MEDIUM]** Add `.catch()` to fire-and-forget DB update.
   - File: `packages/auth/src/resolve-auth.ts:121-125`
   - Add `.catch(() => {})` after the `.where()` call on the void'd promise

2. **[Report 2.2 — MEDIUM]** Use timing-safe comparison in `verifyApiKey`.
   - File: `packages/auth/src/api-key.ts:53-55`
   - Import `timingSafeEqual` from `node:crypto`
   - Replace `hashApiKey(rawKey) === storedHash` with timing-safe comparison using `Buffer.from()` and `timingSafeEqual()`

### Sub-phase 4B: Event Engine

**Requirements**:

1. **[Report 6.1 — HIGH]** Fix retry mechanism — `retryCount` never incremented.
   - File: `packages/events/src/executor.ts`
   - Extend `ExecutionStore.updateStatus` interface (line 38-46) to accept `retryCount` in the details object
   - In `processJob`, when a retry is needed, pass incremented `retryCount` to `updateStatus`
   - Ensure the store implementation persists `retryCount` to the DB

2. **[Report 6.2 — MEDIUM]** Handle partial dispatch failure — add rollback for orphaned records.
   - File: `packages/events/src/executor.ts:94-111`
   - Wrap the loop body in try/catch
   - On `queue.addJob` failure, mark the already-inserted record as "failed" with error message
   - Continue dispatching remaining hooks rather than aborting the entire function

### Sub-phase 4C: Webhooks Engine

**Requirements**:

1. **[Report 7.1 — HIGH]** Move auth resolution inside try-catch in `sendRequest`.
   - File: `packages/webhooks/src/outgoing.ts:158-207`
   - Move `resolveAuthHeaders(config.auth, deps.crypto, body)` (line 167) inside the existing `try` block (after line 176)

2. **[Report 7.2 — MEDIUM]** Validate `maxRetries` in `parseConfig`.
   - File: `packages/webhooks/src/outgoing.ts:80`
   - Add bounds check: if `maxRetries < 0`, default to `3` or clamp to `0`

### Sub-phase 4D: Email Engine

**Requirements**:

1. **[Report 8.1 — HIGH]** Fix partial batch failure creating duplicate exchanges.
   - File: `packages/email/src/imap-sync.ts:265-313`
   - Option A: Update sync state after each successfully processed message (per-message checkpoint)
   - Or Option B: Add idempotency via deduplication key (messageId uniqueness constraint)
   - Ensure `lastUid` is updated per-message, not only after the full loop

### Sub-phase 4E: Storage Package

**Requirements**:

1. **[Report 9.1 — MEDIUM]** Implement quota enforcement in S3 backend.
   - File: `packages/storage/src/s3.ts:85-110`
   - Add `userQuota` check in `put()` method, mirroring the local backend pattern from `local.ts:152-160`
   - Use S3 list operations or a metadata store to calculate current usage

### Sub-phase 4F: AI Engine

**Requirements**:

1. **[Report 10.1 — HIGH]** Pass correct variable to `buildStructuredOutputConfig`.
   - File: `packages/ai/src/hook-executor.ts:246-249`
   - Change `resolved as unknown as import("zod").ZodType<...>` to `resolved.outputSchema as import("zod").ZodType<...>`
   - Remove the unnecessary `as unknown as` double-cast

2. **[Report 10.3 — MEDIUM]** Store AI insight before entity update to prevent data loss.
   - File: `packages/ai/src/hook-executor.ts:296-339`
   - Move insight storage (lines 316-339) BEFORE the entity update (lines 296-312)
   - Set `applied: false` initially, then set `applied: true` after successful entity update
   - Wrap entity update in try/catch; on failure, insight remains stored with `applied: false`

### Sub-phase 4G: i18n Package

**Requirements**:

1. **[Report 13.1 — MEDIUM]** Fix double interpolation in `interpolate` function.
   - File: `packages/i18n/src/i18n.ts:25-31`
   - Replace the sequential `replaceAll` loop with single-pass regex:
   ```ts
   function interpolate(template: string, params?: Record<string, string | number>): string {
     if (!params) return template;
     return template.replace(/\{(\w+)\}/g, (match, key: string) => {
       return key in params ? String(params[key]) : match;
     });
   }
   ```

### Sub-phase 4H: Billing Package

**Requirements**:

1. **[Report 12.2 — MEDIUM]** Include `past_due` in active statuses (or document the exclusion).
   - File: `packages/billing/src/subscription.ts:60-61`
   - Either add `"past_due"` to `activeStatuses` array, or add a code comment explaining the product decision

2. **[Report 12.3 — MEDIUM]** Add logging when webhook drops event due to missing `metadata.userId`.
   - File: `packages/billing/src/subscription.ts:86-87`
   - Add `console.warn("Subscription event received without userId in metadata", stripeSub.id)` before the early return

**Inputs**:
- Read: `packages/auth/src/resolve-auth.ts`
- Read: `packages/auth/src/api-key.ts`
- Read: `packages/events/src/executor.ts`
- Read: `packages/webhooks/src/outgoing.ts`
- Read: `packages/email/src/imap-sync.ts`
- Read: `packages/storage/src/s3.ts`
- Read: `packages/storage/src/local.ts` (reference)
- Read: `packages/ai/src/hook-executor.ts`
- Read: `packages/ai/src/structured-output.ts` (reference)
- Read: `packages/i18n/src/i18n.ts`
- Read: `packages/billing/src/subscription.ts`

**Outputs**:
- Modify: `packages/auth/src/resolve-auth.ts`
- Modify: `packages/auth/src/api-key.ts`
- Modify: `packages/events/src/executor.ts`
- Modify: `packages/webhooks/src/outgoing.ts`
- Modify: `packages/email/src/imap-sync.ts`
- Modify: `packages/storage/src/s3.ts`
- Modify: `packages/ai/src/hook-executor.ts`
- Modify: `packages/i18n/src/i18n.ts`
- Modify: `packages/billing/src/subscription.ts`

**Validation Criteria**:
- Auth: fire-and-forget has `.catch()`, `verifyApiKey` uses `timingSafeEqual`
- Events: retryCount is tracked and persisted, partial dispatch cleans up orphaned records
- Webhooks: auth resolution errors caught, maxRetries validated
- Email: sync state updated per-message, no duplicate exchanges on retry
- Storage: S3 backend enforces quota
- AI: correct variable passed to structured output, insight stored before entity update
- i18n: single-pass interpolation, no double-interpolation possible
- Billing: webhook drops are logged, past_due status decision documented
- Type check: `pnpm check-types` passes with zero errors

---

## Phase 5: API Router Data Integrity

**Type**: Sequential
**Dependencies**: Phase 3 (DB schema changes) should be complete first

**Requirements**:

### Client Router

1. **[Report 15.1 — HIGH]** Fix cursor pagination dropping items with identical `createdAt`.
   - File: `packages/api/src/routers/client/list.ts:17-18,50,55-57`
   - Change cursor to composite `(createdAt, id)` using `and(lt(clients.createdAt, cursorDate), lt(clients.id, cursorId))`
   - Add secondary sort: `.orderBy(desc(clients.createdAt), desc(clients.id))`
   - Encode next cursor as `timestamp:id` string

2. **[Report 15.2 — MEDIUM]** Add `isNull(deletedAt)` guard to client update.
   - File: `packages/api/src/routers/client/update.ts:14-23`
   - Add `isNull(clients.deletedAt)` to the WHERE clause

3. **[Report 15.3 — MEDIUM]** Add date validation to `dateFrom`/`dateTo` in client schemas.
   - File: `packages/api/src/routers/client/schemas.ts:43-44`
   - Change `z.string().optional()` to `z.string().datetime().optional()` or `z.string().pipe(z.coerce.date())` and back to string

### Project Router

4. **[Report 17.3 — MEDIUM]** Add date format validation to project schemas.
   - File: `packages/api/src/routers/project/schemas.ts:15-16`
   - Apply same date validation pattern as client router

5. **[Report 17.4 — MEDIUM]** Use domain constants instead of hardcoded status values.
   - File: `packages/api/src/routers/project/upcoming-deadlines.ts:23`
   - Import `PROJECT_STATUSES` from `@DCRM/domain`
   - Replace `["planning", "active", "on_hold"]` with `[PROJECT_STATUSES.PLANNING, PROJECT_STATUSES.ACTIVE, PROJECT_STATUSES.ON_HOLD]`

### Ticket Router

6. **[Report 18.1 — HIGH]** Add project ownership validation in ticket update.
   - File: `packages/api/src/routers/ticket/update.ts:29-48`
   - When `fields` contains `projectId`, validate that the project exists and belongs to `ctx.user.id`
   - Follow pattern from `ticket/create.ts:50-59`

7. **[Report 18.2 — MEDIUM]** Add date format validation to ticket schemas.
   - File: `packages/api/src/routers/ticket/schemas.ts:16,29`
   - Apply same date validation pattern

8. **[Report 18.3 — MEDIUM]** Escape LIKE wildcards in ticket search.
   - File: `packages/api/src/routers/ticket/search.ts:11`
   - Create a shared `escapeLikeWildcards()` utility: `str.replace(/%/g, "\\%").replace(/_/g, "\\_")`
   - Apply to `input.query` before interpolating into pattern

### Exchange Router

9. **[Report 19.1 — HIGH]** Add LIMIT to threading query in send-email.
   - File: `packages/api/src/routers/exchange/send-email.ts:134-143`
   - Add `.limit(50)` or similar reasonable bound to the query
   - Filter to only exchanges that have `messageId` in metadata
   - Add `.orderBy(desc(exchanges.createdAt))` for deterministic results

10. **[Report 19.3 — MEDIUM]** Fix cursor pagination in exchange list (same pattern as client fix).
    - File: `packages/api/src/routers/exchange/list.ts:29-31,50-52`
    - Apply composite cursor `(createdAt, id)` pattern

11. **[Report 19.4 — MEDIUM]** Add date validation to exchange schemas.
    - File: `packages/api/src/routers/exchange/schemas.ts:32-33`

### Attachment Router

12. **[Report 20.2 — HIGH]** Add entity ownership validation in attachment upload.
    - File: `packages/api/src/routers/attachment/upload.ts:16-37`
    - Validate that `input.entityId` references an entity owned by `ctx.user.id`
    - Use a lookup map based on `input.entityType` to query the appropriate table

13. **[Report 20.3 — MEDIUM]** Sanitize `fileName` in upload schema.
    - File: `packages/api/src/routers/attachment/schemas.ts:10`
    - Add regex validation: `z.string().min(1).regex(/^[^/\\:*?"<>|\0]+$/)`

14. **[Report 20.4 — MEDIUM]** Cache storage backend instance instead of creating per-request.
    - Files: `packages/api/src/routers/attachment/download.ts:33-41`, `packages/api/src/routers/attachment/delete.ts:34-42`
    - Create storage backend once and reuse, or use a lazy singleton pattern

15. **[Report 20.6 — MEDIUM]** Reverse delete order — DB first, then storage.
    - File: `packages/api/src/routers/attachment/delete.ts:44-52`
    - Move `db.delete()` before `backend.delete()`
    - If storage deletion fails after DB deletion, the DB row is gone (acceptable — orphaned storage file is better than phantom DB row)

### Entity Tag Router

16. **[Report 21.2 — HIGH]** Handle duplicate attach gracefully.
    - File: `packages/api/src/routers/entity-tag/attach.ts:38`
    - Wrap the INSERT in try/catch, catch unique constraint violation
    - Return a clear response (the existing association) instead of letting the DB error propagate as 500

17. **[Report 21.3 — HIGH]** Validate `entityType` against domain schema.
    - File: `packages/api/src/routers/entity-tag/schemas.ts:5,13`
    - Replace `z.string().min(1)` with `attachmentEntityTypeSchema` from `@DCRM/domain`
    - Or create a dedicated entity tag type schema that matches types with `tags` relations

### Import/Export & Search

18. **[Report 22.2 — HIGH]** Wrap bulk import in transaction.
    - File: `packages/api/src/routers/import/import-clients.ts:58-108`
    - Wrap the for-loop in `db.transaction()`
    - On any failure, entire batch rolls back

19. **[Report 22.3 — MEDIUM]** Add input size limit to CSV import schema.
    - File: `packages/api/src/routers/import/schemas.ts:16`
    - Add `.max(5_000_000)` or similar limit to `csvData`
    - Add row count limit in `parseCsv` function

20. **[Report 22.4 — MEDIUM]** Escape LIKE wildcards in global search.
    - File: `packages/api/src/routers/search/global.ts:295`
    - Apply `escapeLikeWildcards()` utility to `input.query`

### Settings & Billing Router

21. **[Report 23.2 — HIGH]** Add `BILLING_ENABLED` guard to `getSubscriptionStatus`.
    - File: `packages/api/src/routers/billing/index.ts:32-39`
    - Add `if (!env.BILLING_ENABLED)` check matching the pattern from `createCheckout` (lines 17-19)

22. **[Report 23.3 — HIGH]** Fix race condition in settings upsert.
    - Files: `packages/api/src/routers/settings/update-theme.ts:11-33`, `update-locale.ts:11-33`, `complete-onboarding.ts:11-39`
    - Replace SELECT-then-INSERT with `onConflictDoUpdate` pattern
    - Or wrap in `db.transaction()` with error handling for PK violation

23. **[Report 23.4 — MEDIUM]** Guard against onboarding re-completion.
    - File: `packages/api/src/routers/settings/complete-onboarding.ts:17-28`
    - Check if `onboardingCompleted` is already `true` before updating
    - Return early or throw if already completed

### Email Account Schemas

24. **[Report 24.2 — MEDIUM]** Add email format validation.
    - File: `packages/api/src/routers/email-account/schemas.ts:4,21`
    - Replace `z.string().min(1)` with `z.email()` for email fields

### AI Provider & Chat Router

25. **[Report 25.1 — MEDIUM]** Exclude encrypted key from provider query in send-message.
    - File: `packages/api/src/routers/ai-chat/send-message.ts:19-23`
    - Use a `select()` that excludes `encryptedApiKey` column
    - Add `eq(aiProviders.userId, userId)` to WHERE clause

26. **[Report 25.2 — MEDIUM]** Handle `config: null` explicitly in provider update.
    - File: `packages/api/src/routers/ai-provider/update.ts:44-47`
    - Add explicit check: `if (rest.config === null) { updates.config = {} }` before the `Object.assign` branch

27. **[Report 25.4 — MEDIUM]** Replace plain `Error` with `TRPCError` in AI chat.
    - File: `packages/api/src/routers/ai-chat/send-message.ts:27-31`
    - Replace `throw new Error(...)` with `throw new TRPCError({ code: "NOT_FOUND", message: ... })`

### Hook Router

28. **[Report 26.1 — HIGH]** Make `accept-insight` atomic — store insight applied=true AND apply fields together.
    - File: `packages/api/src/routers/hook/accept-insight.ts:44-56`
    - Actually apply the mapped fields to the entity within the same operation, or use a transaction

29. **[Report 26.3 — MEDIUM]** Check affected row count in hook update and delete.
    - Files: `packages/api/src/routers/hook/update.ts:28-38`, `delete.ts:11-18`
    - Use `.returning()` and check if result is empty
    - Throw `TRPCError({ code: "NOT_FOUND" })` when no rows affected

30. **[Report 26.4 — MEDIUM]** Replace `Record<string, unknown>` with typed object in hook update.
    - File: `packages/api/src/routers/hook/update.ts:13`
    - Use `Partial<typeof hooks.$inferInsert>` or explicit typed object

31. **[Report 26.5 — MEDIUM]** Wire up `listHooksSchema` to `list` procedure.
    - File: `packages/api/src/routers/hook/list.ts:7`
    - Add `.input(listHooksSchema)` to the procedure
    - Apply filters from input (eventType, type, enabled) in the query

### Outgoing Webhook Router

32. **[Report 27.1 — HIGH]** Add URL validation to webhook schemas.
    - File: `packages/api/src/routers/webhook/schemas.ts:8,49`
    - Add `z.string().url()` and optionally add a scheme check for `http`/`https` only

33. **[Report 27.2 + 27.3 — HIGH]** Add `type` filter to webhook update and delete.
    - Files: `packages/api/src/routers/webhook/update.ts:15-23`, `delete.ts:11-18`
    - Add `eq(hooks.type, "outgoing_webhook")` to WHERE clauses

34. **[Report 27.4 — MEDIUM]** Use centralized env validation in auth-builder.
    - File: `packages/api/src/routers/webhook/auth-builder.ts:24-26`
    - Import `env` from `@DCRM/env/server` and use `env.ENCRYPTION_KEY` instead of `process.env`

35. **[Report 27.5 — MEDIUM]** Replace raw `Error` with `TRPCError` in webhook update.
    - File: `packages/api/src/routers/webhook/update.ts:26`
    - Use `throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" })`

### Incoming Webhook Router

36. **[Report 28.1 — HIGH]** Fix `hasSecret` always returning `false`.
    - Files: `packages/api/src/routers/incoming-webhook/read.ts:11-29`, `list.ts:8-21`
    - Add `secret` to the SELECT (or a derived boolean expression like `sql\`secret IS NOT NULL\``)
    - Set `hasSecret` based on actual secret value: `hasSecret: !!row.secret`

37. **[Report 28.3 — MEDIUM]** Replace raw `Error` with `TRPCError` in incoming webhook routes.
    - Files: `packages/api/src/routers/incoming-webhook/update.ts:25`, `test-mapping.ts:27`

38. **[Report 28.4 — MEDIUM]** Move `lastReceivedAt` update after success confirmation.
    - File: `packages/webhooks/src/incoming.ts:211`
    - Move `updateLastReceived` call to after the event is successfully emitted (line 258)

**Inputs**:
- All router files under `packages/api/src/routers/`
- `packages/domain/src/*.ts` for domain constants
- `packages/webhooks/src/incoming.ts`

**Outputs**:
- Modify: All affected router files listed above
- Create: Shared utility `escapeLikeWildcards()` (suggest `packages/api/src/utils/escape-like.ts`)

**Validation Criteria**:
- Cursor pagination returns all items (no skipped records with identical timestamps)
- Soft-deleted entities cannot be updated
- Date fields validated at Zod level
- LIKE wildcards escaped in all search queries
- Entity ownership checked before attachment operations
- Bulk imports are transactional
- `hasSecret` reflects actual secret presence
- All raw `Error` throws replaced with `TRPCError`
- Type check: `pnpm check-types` passes with zero errors

---

## Phase 6: Frontend — Web App Core, Shared Components & Form Schemas

**Type**: Sequential
**Dependencies**: None (frontend changes are independent of backend)

**Requirements**:

### Web App Core

1. **[Report 29.1 — HIGH]** Add body size limit to webhook endpoint.
   - File: `apps/web/src/routes/api/webhook/$token.ts:14`
   - Add `Content-Length` header check before `request.text()`, or use a streaming parser with size limit
   - Reject requests with body > 1MB (or configurable limit) with 413 status

2. **[Report 29.2 — MEDIUM]** Fix global QueryCache `onError` firing on background refetches.
   - File: `apps/web/src/router.tsx:14-22`
   - Add guard: `if (query.state.data === undefined) { toast.error(...) }` to only show toasts on initial load failures

3. **[Report 29.3 — MEDIUM]** Collapse webhook error status codes to prevent token enumeration.
   - File: `packages/webhooks/src/incoming.ts:142-167`
   - Return same status (404) for both "not found" and "disabled" cases
   - Keep 401 for invalid/missing signature as it's a different concern

### Shared Components

4. **[Report 30.1 — MEDIUM]** Add error state handling to ExchangeTimeline.
   - File: `apps/web/src/components/exchange-timeline.tsx:57-75`
   - Add `timelineQuery.isError` check before the empty-data branch
   - Show error message when query fails instead of "No activity recorded yet"

5. **[Report 30.2 — MEDIUM]** Fix GlobalSearch navigation and route mapping.
   - File: `apps/web/src/components/global-search.tsx:82`
   - Replace `window.location.href` with TanStack Router `useNavigate()`
   - Fix `ENTITY_ROUTES` mapping: ticket should navigate to `/tickets/$ticketId`, exchange to correct detail page

6. **[Report 30.3 — MEDIUM]** Add error state handling to GlobalSearch.
   - File: `apps/web/src/components/global-search.tsx:113-162`
   - Add `searchQuery.isError` branch showing error message instead of "No results found"

### Form Schemas

7. **[Report 31.1 — HIGH]** Fix coerce "None" option value in mapping config form schema.
   - File: `apps/web/src/lib/schemas/mapping-config-form-schema.ts:47`
   - Change `{ label: "None", value: "" }` to `{ label: "None", value: undefined }` or handle `""` as `undefined` in transformation

8. **[Report 31.2 — HIGH]** Fix baseUrl/defaultModel defaults in AI provider form schema.
   - File: `apps/web/src/lib/schemas/ai-provider-form-schema.ts:63-64`
   - Change defaults from `""` to `undefined`
   - Or add preprocessing to convert `""` to `undefined` before API submission

9. **[Report 31.3 — HIGH]** Add empty-string-to-undefined transformation in client form schema.
   - File: `apps/web/src/lib/schemas/client-form-schema.ts:60-67`
   - Add a `transform()` or pre-processing step that converts `""` to `undefined` for optional fields
   - Follow the pattern from `lead-form-schema.ts` `toLeadFormInput()`

10. **[Report 31.4 — MEDIUM]** Use domain enum for lead stage in lead form schema.
    - File: `apps/web/src/lib/schemas/lead-form-schema.ts:5-13,34`
    - Import `leadStageSchema` from `@DCRM/domain` instead of duplicating `LEAD_STAGES`
    - Use the domain enum for validation

11. **[Report 31.5 — MEDIUM]** Add email format validation to email account form schema.
    - File: `apps/web/src/lib/schemas/email-account-form-schema.ts:6`
    - Replace `z.string().min(1)` with `z.email()` or `z.string().min(1).email()`

12. **[Report 31.6 — MEDIUM]** Fix staticPayload type in mapping config form schema.
    - File: `apps/web/src/lib/schemas/mapping-config-form-schema.ts:15`
    - Add JSON parsing/validation transformation or change schema to `z.record(z.string(), z.unknown())`

13. **[Report 31.7 — MEDIUM]** Clean up secret schema workaround in incoming webhook form.
    - File: `apps/web/src/lib/schemas/incoming-webhook-form-schema.ts:7`
    - Replace `.or(z.literal(""))` with proper optional handling
    - Change default from `""` to `undefined`

**Inputs**:
- Read: `apps/web/src/routes/api/webhook/$token.ts`
- Read: `apps/web/src/router.tsx`
- Read: `packages/webhooks/src/incoming.ts`
- Read: `apps/web/src/components/exchange-timeline.tsx`
- Read: `apps/web/src/components/global-search.tsx`
- Read: All form schema files under `apps/web/src/lib/schemas/`

**Outputs**:
- Modify: `apps/web/src/routes/api/webhook/$token.ts`
- Modify: `apps/web/src/router.tsx`
- Modify: `packages/webhooks/src/incoming.ts`
- Modify: `apps/web/src/components/exchange-timeline.tsx`
- Modify: `apps/web/src/components/global-search.tsx`
- Modify: All form schema files listed above

**Validation Criteria**:
- Webhook endpoint rejects oversized bodies
- No spurious error toasts on background refetch
- ExchangeTimeline shows error message on failure
- GlobalSearch uses router navigation, correct route mapping
- Form schemas accept valid input and reject invalid input
- Empty string defaults don't cause API errors
- Type check: `pnpm check-types` passes with zero errors

---

## Phase 7: Frontend — Route Pages (Clients, Leads, Projects, Tickets, Dashboard)

**Type**: Sequential
**Dependencies**: None (frontend changes are independent)

**Requirements**:

### Client & Lead Pages

1. **[Report 32.1 — HIGH]** Fix false success toast on lead conversion.
   - File: `apps/web/src/routes/leads/$leadId.convert.tsx:30-38`
   - Move toast INSIDE the null check: only show success when `data?.client?.id` exists
   - Show error toast when result is null

2. **[Report 32.2 — HIGH]** Add confirmation dialog for client delete.
   - File: `apps/web/src/routes/clients/$clientId.tsx:78-85`
   - Add a `<Dialog>` component for delete confirmation (pattern from `$leadId.convert.tsx:149-174`)
   - Only call `softDeleteMutation.mutate()` after confirmation

3. **[Report 32.3 — MEDIUM]** Fix `data?.id ?? ""` fallback in create pages.
   - Files: `apps/web/src/routes/clients/create.tsx:25`, `leads/create.tsx:25`
   - Replace `data?.id ?? ""` with a guard: `if (data?.id) { navigate(...) } else { showError }`
   - Do not navigate with empty ID

4. **[Report 32.4 — MEDIUM]** Fix Kanban stage-move buttons to move correct lead.
   - File: `apps/web/src/routes/leads/index.tsx:238-248`
   - Either: make buttons per-card instead of per-column
   - Or: add a lead selector/picker to choose which lead to move

5. **[Report 32.5 — MEDIUM]** Invalidate search cache after create mutations.
   - Files: `apps/web/src/routes/clients/index.tsx:38-51`, `leads/index.tsx:49-61`
   - Add `trpc.client.search.queryFilter()` / `trpc.lead.search.queryFilter()` to invalidation list in mutation `onSuccess`

6. **[Report 32.6 — MEDIUM]** Fix estimatedValue clearing in lead edit form.
   - File: `apps/web/src/routes/leads/$leadId.edit.tsx`
   - Add transformation to convert `undefined` to `null` for numeric fields
   - Or update the API update handler to treat `null` as "clear the field"

### Project & Ticket Pages

7. **[Report 33.1 — HIGH]** Fix false success toast on project/ticket create.
   - Files: `apps/web/src/routes/projects/create.tsx:27-30`, `tickets/create.tsx:28-34`, `projects/index.tsx:50-53`
   - Move toast inside null/data check, same pattern as lead conversion fix

8. **[Report 33.2 — HIGH]** Fix empty-string date values in edit forms.
   - Files: `apps/web/src/routes/projects/$projectId.edit.tsx:75-76`, `tickets/$ticketId.edit.tsx:71`
   - Change `null → ""` default to `null → undefined`
   - Or transform `""` to `undefined`/`null` before submission

9. **[Report 33.3 — MEDIUM]** Add data check to delete success handlers.
   - Files: `apps/web/src/routes/projects/$projectId.tsx:42-47`, `tickets/$ticketId.tsx:49-54`
   - Check if mutation returned data before showing success toast

10. **[Report 33.4 — MEDIUM]** Handle soft-deleted records in project/ticket detail pages.
    - Files: `apps/web/src/routes/projects/$projectId.tsx`, `tickets/$ticketId.tsx`
    - Check `project.deletedAt` / `ticket.deletedAt` and show "deleted" banner or redirect

### Dashboard & Settings

11. **[Report 34.1 — HIGH]** Fix dashboard stat cards showing 0/1 instead of actual counts.
    - File: `apps/web/src/routes/dashboard.tsx:73-97`
    - Either: Add a `total` field to the list API responses and use it
    - Or: Use dedicated count endpoints that return `COUNT(*)`
    - Remove `limit: 1` from the queries

12. **[Report 34.2 — HIGH]** Fix AI Chat silently losing user message on send failure.
    - File: `apps/web/src/routes/ai-chat.tsx:73-78`
    - Move `setInput("")` into the `onSuccess` callback
    - Add `onError` handler that shows error toast and preserves input text

13. **[Report 34.3 — MEDIUM]** Fix render-phase `navigate()` in onboarding sub-pages.
    - Files: `apps/web/src/routes/onboarding/email-setup.tsx:39-42`, `ai-setup.tsx:38-41`
    - Move `navigate()` call into a `useEffect` (follow pattern from `onboarding/index.tsx:63-67`)

14. **[Report 34.4 — MEDIUM]** Remove unsafe type assertion in AI chat message mapping.
    - File: `apps/web/src/routes/ai-chat.tsx:53-59`
    - Add proper type guard or use `z.enum(["user", "assistant", "system"]).parse(m.role)`

**Inputs**:
- Read: All route page files under `apps/web/src/routes/`
- Read: `apps/web/src/routes/dashboard.tsx`

**Outputs**:
- Modify: All affected route page files

**Validation Criteria**:
- No success toasts when mutations return null
- Delete actions require confirmation
- Dashboard shows actual entity counts
- Chat messages preserved on send failure
- No render-phase side effects
- Date fields handle null correctly in edit forms
- Type check: `pnpm check-types` passes with zero errors

---

## Phase 8: Native App Fixes

**Type**: Sequential
**Dependencies**: None (independent from web app)

**Requirements**:

1. **[Report 35.1 — HIGH]** Add auth guard to dashboard queries.
   - File: `apps/native/src/app/(tabs)/index.tsx:17-26`
   - Add `enabled: !!session?.user` to all four `useQuery` options
   - Move auth check or use conditional query enabling

2. **[Report 35.2 — MEDIUM]** Fix signOut race condition.
   - File: `apps/native/src/app/(tabs)/index.tsx:112-115`
   - `await authClient.signOut()` before calling `queryClient.invalidateQueries()`

3. **[Report 35.3 — MEDIUM]** Add auth guards and error handling to tab screens.
   - Files: `apps/native/src/app/(tabs)/clients.tsx:12-14`, `projects.tsx:13-15`, `tickets.tsx:13-15`
   - Import and use `authClient.useSession()`
   - Add `enabled: !!session?.user` to query options
   - Add error state to `ListEmptyComponent`

4. **[Report 35.4 — MEDIUM]** Extract `ItemSeparatorComponent` to stable reference.
   - Files: `apps/native/src/app/(tabs)/clients.tsx:45`, `projects.tsx:46`, `tickets.tsx:46`
   - Define separator component outside the screen component body
   - Or use `useMemo`/`useCallback` for stable reference

**Inputs**:
- Read: `apps/native/src/app/(tabs)/index.tsx`
- Read: `apps/native/src/app/(tabs)/clients.tsx`
- Read: `apps/native/src/app/(tabs)/projects.tsx`
- Read: `apps/native/src/app/(tabs)/tickets.tsx`

**Outputs**:
- Modify: `apps/native/src/app/(tabs)/index.tsx`
- Modify: `apps/native/src/app/(tabs)/clients.tsx`
- Modify: `apps/native/src/app/(tabs)/projects.tsx`
- Modify: `apps/native/src/app/(tabs)/tickets.tsx`

**Validation Criteria**:
- No unauthenticated API calls on app launch
- Sign-out completes before query invalidation
- Tab screens handle auth errors gracefully
- FlatList separators use stable references
- Type check: `pnpm check-types` passes with zero errors

---

## Execution Strategy

```
Phase 1 (Critical)  ─────┐
Phase 2 (Docker/Infra) ──┤── Can run in parallel
Phase 3 (DB Schema) ─────┘
                          │
Phase 4 (Core Engines) ───┤── Depends on Phase 3 for schema
Phase 5 (API Routers) ────┤── Depends on Phase 3 for schema
                          │
Phase 6 (Frontend Core) ──┤── Independent
Phase 7 (Frontend Pages) ─┤── Independent
Phase 8 (Native App) ─────┘── Independent
```

**Optimal execution order**:
1. Phases 1, 2, 3 in parallel
2. Phases 4, 5 after Phase 3 completes
3. Phases 6, 7, 8 in parallel (or anytime)

## Success Criteria

- All 70 confirmed findings addressed across 8 phases
- `pnpm check-types` passes with zero errors
- `pnpm build` succeeds
- No new issues introduced by fixes
- 5 CRITICAL issues resolved in Phase 1
- All HIGH severity issues resolved in Phases 1-5
- All MEDIUM/LOW issues resolved in Phases 6-8
