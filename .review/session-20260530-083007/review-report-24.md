# Code Review Report — Cluster 24: Email Account API

**Reviewer**: Code Review Expert (Cluster 24)
**Date**: 2026-05-30
**Scope**: `packages/api/src/routers/email-account/` (10 files)
**Focus**: Security — credential encryption, authorized address validation, userId scoping, credential rotation

---

## Summary

Reviewed all 10 files in the email-account router. Found **2 real issues**: one critical data-loss bug in the update mutation and one email validation gap. The rest of the codebase is well-structured: credentials are properly encrypted at rest, all queries are scoped by `userId`, and authorized address patterns are validated before storage.

---

### [SEVERITY: CRITICAL] Finding 1: Update Mutation Silently Drops All Credential and Sync Fields

**File**: `packages/api/src/routers/email-account/update.ts:37-93`
**Problem**: The `.set()` call uses **database column names** (snake_case) as object keys, but Drizzle ORM's `.set()` method expects **TypeScript property names** (camelCase) as defined in the `pgTable` schema. Unrecognized keys are silently ignored at runtime. This means the update mutation successfully executes but only updates `email` and `updatedAt` — every other field change is silently discarded.

The root cause is compounded by the use of `Record<string, unknown>` (line 33) which bypasses Drizzle's compile-time type safety, allowing the mismatched keys to pass without TypeScript errors.

**Evidence**:

The DB schema (`packages/db/src/schema/automation.ts:271-298`) defines:
```ts
syncEnabled: boolean("sync_enabled").notNull().default(false),
syncInterval: integer("sync_interval").notNull().default(15),
encryptedImapHost: text("encrypted_imap_host").notNull(),
// ... etc
```

But `update.ts` uses the DB column names as `.set()` keys:
```ts
// Line 38 — WRONG: should be "syncEnabled"
setValues["sync_enabled"] = updates.syncEnabled;

// Line 39 — WRONG: should be "syncInterval"  
setValues["sync_interval"] = updates.syncInterval;

// Lines 62-65 — WRONG: should be "encryptedImapHost", etc.
setValues["encrypted_imap_host"] = updatedImap.encryptedImapHost;
setValues["encrypted_imap_port"] = updatedImap.encryptedImapPort;
setValues["encrypted_imap_user"] = updatedImap.encryptedImapUser;
setValues["encrypted_imap_password"] = updatedImap.encryptedImapPassword;

// Lines 89-92 — WRONG: should be "encryptedSmtpHost", etc.
setValues["encrypted_smtp_host"] = updatedSmtp.encryptedSmtpHost;
setValues["encrypted_smtp_port"] = updatedSmtp.encryptedSmtpPort;
setValues["encrypted_smtp_user"] = updatedSmtp.encryptedSmtpUser;
setValues["encrypted_smtp_password"] = updatedSmtp.encryptedSmtpPassword;
```

The only fields that update correctly are `email` (line 37) and `updatedAt` (line 34), because their TypeScript property names happen to match their intended behavior.

**Impact**:
- Users change their IMAP/SMTP passwords → the old credentials remain active. The user believes their credentials were rotated, but they weren't. This is a **silent credential rotation failure**.
- Users toggle `syncEnabled` or change `syncInterval` → settings don't take effect. Email sync behavior cannot be controlled.
- The API returns `{ id }` implying success, so the client has no way to detect the failure.
- The decrypt-then-re-encrypt logic (lines 48-60, 75-87) runs successfully but its results are thrown away.

**Suggestion**: Replace the `Record<string, unknown>` approach with a properly typed object using Drizzle property names:

```ts
// Build a typed partial update object
const setValues: Partial<typeof emailAccounts.$inferInsert> = {
  updatedAt: new Date(),
};

if (updates.email !== undefined) setValues.email = updates.email;
if (updates.syncEnabled !== undefined) setValues.syncEnabled = updates.syncEnabled;
if (updates.syncInterval !== undefined) setValues.syncInterval = updates.syncInterval;

// Re-encrypt IMAP credentials if any changed
if (
  updates.imapHost !== undefined ||
  updates.imapPort !== undefined ||
  updates.imapUser !== undefined ||
  updates.imapPassword !== undefined
) {
  const currentImap = credentialConfig.decryptImap({
    encryptedImapHost: existing.encryptedImapHost,
    encryptedImapPort: existing.encryptedImapPort,
    encryptedImapUser: existing.encryptedImapUser,
    encryptedImapPassword: existing.encryptedImapPassword,
  });

  const updatedImap = credentialConfig.encryptImap({
    host: updates.imapHost ?? currentImap.host,
    port: updates.imapPort ?? currentImap.port,
    user: updates.imapUser ?? currentImap.user,
    password: updates.imapPassword ?? currentImap.password,
  });

  setValues.encryptedImapHost = updatedImap.encryptedImapHost;
  setValues.encryptedImapPort = updatedImap.encryptedImapPort;
  setValues.encryptedImapUser = updatedImap.encryptedImapUser;
  setValues.encryptedImapPassword = updatedImap.encryptedImapPassword;
}

// Same pattern for SMTP...
```

This ensures TypeScript's type checker will catch any future property name mismatches at compile time.

---

### [SEVERITY: MEDIUM] Finding 2: Email Fields Accept Non-Email Strings

**File**: `packages/api/src/routers/email-account/schemas.ts:4`
**Problem**: The `email` field in both `createEmailAccountSchema` and `updateEmailAccountSchema` uses `z.string().min(1)` instead of Zod 4's `z.email()` validator. Per the project's code rules (AGENTS.md: "Zod 4 syntax only. `z.object(...)`, `z.string()`, `z.email()`"), email fields should use `z.email()`. The current validation allows any non-empty string like `"not-an-email"` or `"hello world"` to be stored as an email account address.

**Evidence**:
```ts
// schemas.ts line 4
email: z.string().min(1),

// schemas.ts line 21
email: z.string().min(1).optional(),
```

**Impact**: Garbage data can be stored as email addresses. Downstream systems (email matching, authorized address resolution, IMAP/SMTP connection validation) may receive malformed email strings, leading to confusing errors or silent failures.

**Suggestion**:
```ts
email: z.email(),
```

---

## Items Explicitly Reviewed and Found Correct

The following security-sensitive areas were examined and found to be properly implemented:

- **Credential encryption at rest**: `create.ts` encrypts all IMAP/SMTP fields before insertion using `createEmailCredentialConfig`. `update.ts` decrypts → merges → re-encrypts (logic is correct; only the `.set()` key names are wrong). `read.ts` and `list.ts` never expose encrypted fields to the client.
- **userId scoping**: Every query and mutation (read, list, create, update, delete, authorized address operations) correctly filters by `ctx.user.id`. No cross-user data leakage is possible.
- **Authorized address validation**: `add-authorized-address.ts` calls `isValidPattern()` for each pattern before insertion, rejecting malformed patterns. The `isValidPattern` function in `@DCRM/email/matching.ts` correctly validates both exact emails and `*@domain.com` wildcards.
- **Soft-delete awareness**: The authorized address operations correctly include `isNull(clients.deletedAt)` to avoid operating on soft-deleted clients.
- **delete.ts**: Cascade deletion is handled at the DB schema level (`onDelete: "cascade"` on `emailSyncState.emailAccountId`). The mutation correctly scopes by `userId`.
- **Error handling**: Missing resources return `null` (read, list-authorized-addresses) or throw descriptive errors (add/remove authorized address), which is consistent API behavior.
