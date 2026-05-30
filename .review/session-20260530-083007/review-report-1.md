# Code Review Report — Cluster 1: Database Schema

**Reviewer**: Code Review Expert (Cluster 1)
**Date**: 2026-05-30
**Scope**: `packages/db/src/schema/`, `packages/db/drizzle.config.ts`, `packages/db/docker-compose.yml`, `packages/db/__tests__/`
**Focus**: Data modeling correctness, indexing strategy, foreign key constraints, cascade deletes, nullable/column type safety, migration compatibility

---

## Summary

The database schema is well-structured overall. Auth tables follow Better Auth conventions. CRM tables use a consistent soft-delete pattern with appropriate indexes. Automation tables model a rich event/hook/AI pipeline with proper encrypted credential storage. Cascade behaviors are deliberate and consistent.

**Three real issues** were found — two missing unique constraints that can cause data integrity problems under concurrent access, and one migration compatibility gap.

---

### [SEVERITY: HIGH] Finding 1: emailSyncState lacks unique constraint on (emailAccountId, folder)

**File**: `packages/db/src/schema/automation.ts:301-320`
**Problem**: The `emailSyncState` table stores per-folder IMAP sync state for each email account, but has no unique constraint on the `(emailAccountId, folder)` combination. This allows duplicate rows for the same account+folder pair, which corrupts sync state tracking.

**Evidence**:
```ts
export const emailSyncState = pgTable(
  "email_sync_state",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emailAccountId: text("email_account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    folder: text("folder").notNull(),
    lastUid: text("last_uid"),
    uidValidity: text("uid_validity"),
    lastSyncAt: timestamp("last_sync_at").notNull(),
  },
  (table) => [
    index("email_sync_state_user_id_idx").on(table.userId),
    index("email_sync_state_email_account_id_idx").on(table.emailAccountId),
    // No unique constraint on (emailAccountId, folder)
  ],
);
```

**Impact**: A race condition between two concurrent sync processes for the same account/folder (e.g., the user triggers a manual sync while an automatic sync is running) can insert duplicate `emailSyncState` rows. Once duplicates exist:
- `lastUid` values diverge across rows → emails are re-fetched or skipped
- UID validity checks become inconsistent → silent data loss or duplicates in the exchanges table
- The duplicate is hard to detect and clean up without manual DB intervention

**Suggestion**: Add a unique index on `(emailAccountId, folder)`:
```ts
(table) => [
  index("email_sync_state_user_id_idx").on(table.userId),
  index("email_sync_state_email_account_id_idx").on(table.emailAccountId),
  uniqueIndex("email_sync_state_account_folder_idx").on(table.emailAccountId, table.folder),
],
```

---

### [SEVERITY: MEDIUM] Finding 2: emailAccounts lacks unique constraint on (userId, email)

**File**: `packages/db/src/schema/automation.ts:271-299`
**Problem**: The `emailAccounts` table has no unique constraint on the `(userId, email)` combination (or even just `email`). This allows the same email address to be registered as an IMAP account multiple times for the same user.

**Evidence**:
```ts
export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // ... credentials ...
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    syncInterval: integer("sync_interval").notNull().default(15),
    // ...
  },
  (table) => [
    index("email_accounts_user_id_idx").on(table.userId),
    // No unique constraint on (userId, email) or email
  ],
);
```

**Impact**: If the same email account is added twice:
- Two sync loops run concurrently for the same mailbox → every email is processed twice, creating duplicate `exchanges` records
- The `emailSyncState` table gets two independent sync trackers for the same account → UID tracking conflicts
- In a single-user CRM, the risk is primarily from UI bugs or double-form-submission, but the consequence (duplicate emails in the CRM) is user-visible data corruption

**Suggestion**: Add a unique index:
```ts
(table) => [
  index("email_accounts_user_id_idx").on(table.userId),
  uniqueIndex("email_accounts_user_email_idx").on(table.userId, table.email),
],
```

---

### [SEVERITY: MEDIUM] Finding 3: Migration file does not cover automation schema or latest CRM columns

**File**: `packages/db/src/migrations/0000_elite_vin_gonzales.sql`
**Problem**: The single migration file only creates the `auth` and `crm` tables. It does not include:
1. The `authorized_addresses` column on the `clients` table (added in schema at `crm.ts:92` but absent from migration)
2. **All 13 automation tables** (`events`, `hooks`, `hookExecutions`, `incomingWebhooks`, `aiProviders`, `aiInsights`, `aiChatMessages`, `emailAccounts`, `emailSyncState`, `unmatchedEmails`, `apiKeys`, `subscriptions`, `notifications`)
3. All automation-related enums (`event_source`, `hook_type`, `hook_write_behavior`, `hook_execution_status`, `incoming_webhook_mode`, `ai_provider`, `ai_chat_role`, `billing_status`)

**Evidence**: The migration journal (`meta/_journal.json`) contains only one entry. The SQL file ends at line 232 after creating CRM indexes. No automation tables appear in the migration SQL.

**Impact**: If the application is deployed using `drizzle-kit migrate` (the standard production workflow), the database will be missing all automation tables and the `authorized_addresses` column. This will cause runtime errors when any automation feature is accessed. The `drizzle-kit push` command (used in development) masks this issue because it syncs the schema directly to the database.

**Suggestion**: Generate a new migration to capture the automation schema and the missing column:
```bash
pnpm --filter @DCRM/db drizzle-kit generate
```
This should be done before any deployment to an environment that uses migration-based schema management.

---

## Items Reviewed — No Issues Found

The following areas were thoroughly reviewed and found to be sound:

- **Auth schema** (`auth.ts`): Standard Better Auth table structure. PKs, unique constraints on `user.email` and `session.token`, proper cascade deletes. `$onUpdate` handlers on timestamps are correct.

- **CRM cascade strategy** (`crm.ts`): The soft-delete pattern (`deletedAt`) combined with DB-level cascades is a deliberate design. Cascades only fire on hard delete (direct SQL), which should not occur through the application. The cascade chain (`client → project → ticket → exchange`) is consistent with the domain model.

- **Polymorphic associations** (`entityTags`, `attachments`): The `entityType`/`entityId` pattern is a standard polymorphic design. The unique index on `entity_tags(tagId, entityType, entityId)` prevents duplicate tag assignments. Application-layer cleanup is expected when entities are soft-deleted.

- **Encrypted credential storage** (`automation.ts`): IMAP/SMTP credentials in `emailAccounts` and API keys in `aiProviders` are stored in encrypted-prefixed columns, indicating application-level encryption before DB storage. `apiKeys.keyHash` stores only the hash, not the raw key.

- **Index coverage**: All foreign keys are indexed. Composite indexes cover common query patterns (entity polymorphic lookups, user-scoped queries). The `notifications.read` index could be a partial index (`WHERE read = false`) for efficiency, but this is an optimization, not a correctness issue.

- **Docker Compose** (`docker-compose.yml`): Local development configuration with health check and persistent volume. The unpinned `postgres` image tag is a dev-only concern.

- **Test files** (`__tests__/`): Adequate structural tests verifying column presence, relation definitions, and enum alignment with domain constants.

---

## Verdict

**3 findings**: 1 HIGH (missing unique constraint on sync state), 2 MEDIUM (duplicate email account prevention, stale migration). The schema design is competent — these are constraint gaps that are easy to miss in initial development but will cause real problems under concurrent access or deployment.
