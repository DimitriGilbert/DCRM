# Verified Report — Cluster 24: Email Account API

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-24.md

---

## Verification Summary

| # | Original Severity | Finding | Verdict |
|---|-------------------|---------|---------|
| 1 | CRITICAL | Update mutation uses wrong column names in `.set()` | ✅ **CONFIRMED** |
| 2 | MEDIUM | Email fields accept non-email strings | ✅ **CONFIRMED** |

---

### [SEVERITY: CRITICAL] Finding 1: Update Mutation uses wrong column names — ✅ CONFIRMED

**File**: `packages/api/src/routers/email-account/update.ts:37-93`

**Evidence Verified**:

1. **DB Schema** (automation.ts:271-298): The `emailAccounts` table defines TypeScript property names in camelCase:
   - `syncEnabled: boolean("sync_enabled")` — TS property `syncEnabled`, DB column `sync_enabled`
   - `syncInterval: integer("sync_interval")` — TS property `syncInterval`, DB column `sync_interval`
   - `encryptedImapHost: text("encrypted_imap_host")` — TS property `encryptedImapHost`, DB column `encrypted_imap_host`
   - Same pattern for all encrypted IMAP/SMTP fields.

2. **update.ts uses DB column names (snake_case) as `.set()` keys**:
   - Line 38: `setValues["sync_enabled"]` — WRONG, should be `setValues.syncEnabled`
   - Line 39: `setValues["sync_interval"]` — WRONG, should be `setValues.syncInterval`
   - Line 62: `setValues["encrypted_imap_host"]` — WRONG, should be `setValues.encryptedImapHost`
   - Lines 63-65: Same pattern for `encrypted_imap_port`, `encrypted_imap_user`, `encrypted_imap_password`
   - Lines 89-92: Same pattern for all SMTP encrypted fields

3. **Only `email` and `updatedAt` work correctly** because their TS property names match the intended keys:
   - Line 34: `setValues["updatedAt"]` — matches `updatedAt: timestamp("updated_at")` ✓
   - Line 37: `setValues["email"]` — matches `email: text("email")` ✓

4. **Type safety bypass**: Line 33 declares `Record<string, unknown>` which bypasses Drizzle's compile-time key checking. Every other `.set()` call in the codebase uses properly typed objects with camelCase property names (confirmed via grep of 21 `.set()` calls across the routers).

5. **Impact verified**: The decrypt-then-re-encrypt logic (lines 48-66, 75-93) runs correctly and produces the right values, but those values are written to snake_case keys that Drizzle silently ignores. The update succeeds (no error) but only `email` and `updatedAt` actually change.

**Verdict**: CONFIRMED. This is a critical silent data-loss bug. Users changing their IMAP/SMTP credentials, sync settings, or sync intervals will believe the update succeeded (the API returns `{ id }`), but their changes are silently discarded. The old credentials remain active. The fix requires replacing all snake_case keys with camelCase property names.

---

### [SEVERITY: MEDIUM] Finding 2: Email fields accept non-email strings — ✅ CONFIRMED

**File**: `packages/api/src/routers/email-account/schemas.ts:4,21`

**Evidence Verified**:

1. **Line 4** (create schema): `email: z.string().min(1)` — accepts any non-empty string.
2. **Line 21** (update schema): `email: z.string().min(1).optional()` — same issue.
3. **AGENTS.md code rule**: "Zod 4 syntax only. `z.object(...)`, `z.string()`, `z.email()`"
4. **The `z.email()` validator** is available in Zod 4 but not used here.

**Verdict**: CONFIRMED. Email fields lack format validation. Strings like `"not-an-email"` or `"hello world"` would be accepted and stored. This violates the project's own code rules about using `z.email()` for email fields.

---

## Items Verified as Correct

The following were cross-checked and found properly implemented:

- **Credential encryption at rest**: `create.ts` encrypts before insert. `update.ts` decrypts → merges → re-encrypts (logic is correct; only the `.set()` key names are wrong). Read/list operations never expose encrypted fields.
- **userId scoping**: All queries/mutations filter by `ctx.user.id`. No cross-user data leakage possible.
- **Authorized address validation**: `add-authorized-address.ts` validates patterns via `isValidPattern()` before insertion.
- **Soft-delete awareness**: Authorized address operations correctly include `isNull(clients.deletedAt)`.

---

## Overall Assessment

Both findings are confirmed. Finding 1 is the most severe bug found across all five reports — it renders the entire email account update feature non-functional for credential changes and sync settings, while giving the user the appearance of success.
