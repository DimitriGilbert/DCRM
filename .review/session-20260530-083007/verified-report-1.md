# Verified Review Report — Cluster 1: Database Schema

**Original Report**: `review-report-1.md`
**Verifier**: Verification Agent
**Date**: 2026-05-30
**Result**: **3 CONFIRMED, 0 DISMISSED** — All findings are real.

---

### Finding 1: emailSyncState lacks unique constraint on (emailAccountId, folder) — CONFIRMED

**Original**: The `emailSyncState` table has no unique constraint on `(emailAccountId, folder)`, allowing duplicate rows for the same account+folder pair under concurrent access.

**Verification**: The actual source code at `packages/db/src/schema/automation.ts:301-320` confirms the table definition uses only non-unique indexes:

```ts
// automation.ts:316-319
(table) => [
  index("email_sync_state_user_id_idx").on(table.userId),
  index("email_sync_state_email_account_id_idx").on(table.emailAccountId),
  // NO uniqueIndex on (emailAccountId, folder)
],
```

The table semantically represents one sync state per (account, folder) pair — each row tracks `lastUid` and `uidValidity` for a specific IMAP folder of a specific email account. Multiple rows for the same pair would cause divergent sync pointers. A `uniqueIndex` on `(table.emailAccountId, table.folder)` is the correct fix.

No application-layer code references `emailSyncState` yet (grep of `packages/api` returned zero matches for `emailSyncState` or `email_sync_state`), so there's no compensating deduplication logic elsewhere. The constraint must be added at the schema level before the email sync feature is built.

**Verdict**: Real issue. The constraint gap exists and will cause data corruption once the email sync feature is implemented and subjected to concurrent access.

---

### Finding 2: emailAccounts lacks unique constraint on (userId, email) — CONFIRMED

**Original**: The `emailAccounts` table has no unique constraint on `(userId, email)`, allowing the same email address to be registered multiple times for the same user.

**Verification**: The schema at `packages/db/src/schema/automation.ts:271-299` confirms only a non-unique index exists:

```ts
// automation.ts:296-298
(table) => [
  index("email_accounts_user_id_idx").on(table.userId),
  // NO uniqueIndex on (userId, email)
],
```

More critically, the application-layer create mutation at `packages/api/src/routers/email-account/create.ts:30` performs a direct insert with **no prior duplicate check**:

```ts
// create.ts:30
await db.insert(emailAccounts).values({
  id,
  userId: ctx.user.id,
  email: input.email,
  // ... credentials ...
});
```

The input validation schema at `packages/api/src/routers/email-account/schemas.ts:4` only validates `z.string().min(1)` for email — no email format validation and no duplicate check. There is nothing preventing double-form-submission or concurrent requests from inserting duplicate email accounts for the same user.

**Verdict**: Real issue. Neither the database nor the application layer guards against duplicate email accounts. A `uniqueIndex` on `(table.userId, table.email)` is the correct fix.

---

### Finding 3: Migration file does not cover automation schema or latest CRM columns — CONFIRMED

**Original**: The single migration file only creates auth and CRM tables. It is missing all 13 automation tables, all automation enums, and the `authorized_addresses` column on the `clients` table.

**Verification**: Three independent checks confirm this:

1. **Missing CRM column**: The migration SQL at `packages/db/src/migrations/0000_elite_vin_gonzales.sql:70-85` creates the `clients` table without `authorized_addresses`:
   ```sql
   CREATE TABLE "clients" (
     "id" text PRIMARY KEY NOT NULL,
     ...
     "custom_fields" jsonb,
     "created_at" timestamp DEFAULT now() NOT NULL,
     "updated_at" timestamp DEFAULT now() NOT NULL,
     "deleted_at" timestamp
   );
   ```
   But the schema at `packages/db/src/schema/crm.ts:92` defines it:
   ```ts
   authorizedAddresses: jsonb("authorized_addresses").$type<string[]>().default([]),
   ```

2. **Missing automation tables**: The migration contains zero references to any of these tables defined in `automation.ts`: `events`, `hooks`, `hook_executions`, `incoming_webhooks`, `ai_providers`, `ai_insights`, `ai_chat_messages`, `email_accounts`, `email_sync_state`, `unmatched_emails`, `api_keys`, `subscriptions`, `notifications`.

3. **Missing automation enums**: The migration only creates CRM enums (`exchange_direction`, `exchange_type`, `lead_stage`, `project_status`, `ticket_priority`, `ticket_status`, `ticket_type`). It is missing all automation enums: `event_source`, `hook_type`, `hook_write_behavior`, `hook_execution_status`, `incoming_webhook_mode`, `ai_provider`, `ai_chat_role`, `billing_status`.

4. **Single migration entry**: The journal at `meta/_journal.json` contains only one entry (`idx: 0`). Only one `.sql` file exists in the migrations directory.

**Verdict**: Real issue. Running `drizzle-kit migrate` on a fresh database will produce a schema missing all automation features and the `authorized_addresses` column. Development environments using `drizzle-kit push` would not notice. A new migration must be generated before any deployment.

---

## Summary

| # | Finding | Severity | Verdict |
|---|---------|----------|---------|
| 1 | `emailSyncState` missing unique constraint on `(emailAccountId, folder)` | HIGH | **CONFIRMED** |
| 2 | `emailAccounts` missing unique constraint on `(userId, email)` | MEDIUM | **CONFIRMED** |
| 3 | Migration missing automation tables, enums, and `authorized_addresses` column | MEDIUM | **CONFIRMED** |

All three findings are genuine issues. No false positives were found in the original report.
