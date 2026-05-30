# Review Report - Cluster 19: Email Account Router

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Scope**: Email account CRUD, authorized address management, encrypted credential handling

## Summary

Reviewed 10 files implementing email account CRUD and authorized address management. The code is generally well-structured with proper auth scoping, encryption of credentials, and safe query patterns. Found **3 findings**: one race condition with data loss potential, one inconsistent error handling pattern that produces wrong HTTP status codes, and one missing userId guard on a write operation.

---

### [SEVERITY: HIGH] Finding 1: Race Condition in Authorized Address Add — Data Loss via Read-Modify-Write Without Transaction

**File**: `packages/api/src/routers/email-account/add-authorized-address.ts:20-54`
**Problem**: The `addAuthorizedAddress` mutation reads the current `authorizedAddresses` array (line 20-33), computes a merged result in application code (line 46), then writes it back (line 48-54) without any transaction or row-level lock. Two concurrent requests adding different patterns to the same client will both read the same snapshot, each compute its own merged array, and the second write will silently overwrite the first's additions — losing patterns permanently.

**Evidence**:
```typescript
// READ: fetches current authorizedAddresses
const [client] = await db
  .select({ id: clients.id, authorizedAddresses: clients.authorizedAddresses })
  .from(clients)
  .where(and(eq(clients.id, input.clientId), eq(clients.userId, ctx.user.id), isNull(clients.deletedAt)))
  .limit(1);

const existing = client.authorizedAddresses ?? [];
const newPatterns = input.patterns.filter((p) => !existing.includes(p));
const updated = [...existing, ...newPatterns]; // computed in app, not atomic

// WRITE: no transaction, no row lock
await db.update(clients).set({ authorizedAddresses: updated, updatedAt: new Date() })
  .where(eq(clients.id, input.clientId));
```

**Impact**: Concurrent UI interactions (e.g., rapidly adding two sets of addresses, or multiple browser tabs) will silently lose authorized address patterns. The user would see one batch appear and the other vanish without any error.

**Suggestion**: Wrap the read-modify-write in a `db.transaction` with a row lock, consistent with the established pattern used in `import/import-clients.ts`, `hook/accept-insight.ts`, and `lead/convert.ts`:

```typescript
await db.transaction(async (tx) => {
  const [client] = await tx
    .select({ id: clients.id, authorizedAddresses: clients.authorizedAddresses })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.userId, ctx.user.id), isNull(clients.deletedAt)))
    .limit(1)
    .for("update"); // PostgreSQL row-level lock

  if (!client) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
  }

  const existing = client.authorizedAddresses ?? [];
  const newPatterns = input.patterns.filter((p) => !existing.includes(p));
  if (newPatterns.length === 0) {
    return { clientId: input.clientId, authorizedAddresses: existing };
  }

  const updated = [...existing, ...newPatterns];
  await tx.update(clients).set({ authorizedAddresses: updated, updatedAt: new Date() })
    .where(eq(clients.id, input.clientId));

  return { clientId: input.clientId, authorizedAddresses: updated };
});
```

---

### [SEVERITY: MEDIUM] Finding 2: Raw `Error` Thrown Instead of `TRPCError` — Wrong HTTP Status Codes for Clients

**File**: `packages/api/src/routers/email-account/add-authorized-address.ts:15,36` and `packages/api/src/routers/email-account/remove-authorized-address.ts:27`
**Problem**: These files throw raw `Error` for validation failures and not-found conditions. tRPC converts unhandled errors to `INTERNAL_SERVER_ERROR` (HTTP 500). The rest of the codebase consistently uses `TRPCError` with proper codes (`BAD_REQUEST`, `NOT_FOUND`). This means the API client receives a 500 for a bad pattern or missing client, making it impossible to distinguish user errors from server failures.

**Evidence**:
```typescript
// add-authorized-address.ts:15 — validation error should be BAD_REQUEST
throw new Error(`Invalid authorized address pattern: "${pattern}". Use exact email or *@domain.com format.`);

// add-authorized-address.ts:36 — missing entity should be NOT_FOUND
throw new Error("Client not found");

// remove-authorized-address.ts:27 — missing entity should be NOT_FOUND
throw new Error("Client not found");
```

Compare with the established pattern in `hook/update.ts`, `webhook/update.ts`, `exchange/send-email.ts`, etc.:
```typescript
throw new TRPCError({ code: "NOT_FOUND", message: "Hook not found" });
throw new TRPCError({ code: "BAD_REQUEST", message: "AI provider is disabled" });
```

**Impact**: Client-side error handling cannot distinguish between "you sent a bad pattern" (user error, should show a form validation message) and "the server crashed" (should show a generic error/retry UI). Both appear as 500s.

**Suggestion**: Replace with `TRPCError`:
```typescript
import { TRPCError } from "@trpc/server";

// Validation error
throw new TRPCError({
  code: "BAD_REQUEST",
  message: `Invalid authorized address pattern: "${pattern}". Use exact email or *@domain.com format.`,
});

// Not found
throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
```

---

### [SEVERITY: MEDIUM] Finding 3: UPDATE in Authorized Address Operations Missing `userId` Guard

**File**: `packages/api/src/routers/email-account/add-authorized-address.ts:48-54` and `packages/api/src/routers/email-account/remove-authorized-address.ts:33-39`
**Problem**: The UPDATE statements filter only by `clients.id` without re-checking `userId` or `deletedAt`. While the preceding SELECT verifies ownership, the read and write are not atomic. If any future code path (admin tool, migration, or a different procedure) were to change the client's ownership or soft-delete state between the SELECT and UPDATE, this mutation would modify a row the user no longer owns. This is a defense-in-depth gap — the codebase's own CRUD routers (e.g., `update.ts` in this same directory) consistently include `userId` in both the SELECT and UPDATE WHERE clauses.

**Evidence**:
```typescript
// add-authorized-address.ts:48-54 — UPDATE only filters by id
await db.update(clients).set({
  authorizedAddresses: updated,
  updatedAt: new Date(),
}).where(eq(clients.id, input.clientId));
// Missing: eq(clients.userId, ctx.user.id), isNull(clients.deletedAt)

// remove-authorized-address.ts:33-39 — same issue
await db.update(clients).set({
  authorizedAddresses: updated,
  updatedAt: new Date(),
}).where(eq(clients.id, input.clientId));
```

Compare with the consistent pattern in this same router directory:
```typescript
// update.ts:93-101 — includes userId in both SELECT and UPDATE
await db.update(emailAccounts).set(setValues)
  .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, ctx.user.id)));
```

**Impact**: In the current single-user app, this is low risk. However, it creates a maintenance hazard — if the app ever adds admin operations or the ownership model changes, these mutations would silently modify records without authorization checks. It also violates the consistent pattern established by sibling routers.

**Suggestion**: Include the ownership and soft-delete checks in the UPDATE WHERE clause:
```typescript
await db.update(clients).set({
  authorizedAddresses: updated,
  updatedAt: new Date(),
}).where(
  and(
    eq(clients.id, input.clientId),
    eq(clients.userId, ctx.user.id),
    isNull(clients.deletedAt),
  ),
);
```

---

## Items Reviewed — No Issues Found

- **schemas.ts**: All validation schemas are well-defined. `z.email()` for emails, port ranges 1-65535, sync interval capped at 1440 minutes (24h), patterns require `min(1)` array elements.
- **create.ts**: Proper encryption of all IMAP/SMTP credentials via `createEmailCredentialConfig`. No encrypted data returned in response. DB unique index on `(userId, email)` handles deduplication.
- **read.ts**: Proper userId scoping in WHERE clause. Returns only non-sensitive fields. Returns `null` for not-found (correct for queries).
- **update.ts**: Credential update correctly decrypts current values, merges changed fields, re-encrypts all. The read-decrypt-modify-encrypt-write pattern has a theoretical TOCTOU issue but is acceptable for a single-user CRM and would require a transaction fix similar to Finding 1.
- **delete.ts**: Proper userId scoping, uses `returning` for confirmation. Cascade deletes handle related sync state.
- **list.ts**: Proper userId scoping, returns only non-sensitive fields.
- **list-authorized-addresses.ts**: Proper userId + soft-delete scoping. Reuses `emailAccountIdSchema` (which is just `{ id: string }`) for client lookup — semantically imprecise naming but functionally correct.
- **Encryption layer** (`@DCRM/email/config.ts`): AES-256-GCM encryption, each field encrypted independently, port numbers converted to strings for encryption and back to numbers on decryption. Solid implementation.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 1     |
| MEDIUM   | 2     |
| **Total**| **3** |

**Finding 1** (race condition in authorized address add) is the most impactful — it can cause silent data loss under concurrent access. Findings 2 and 3 are defense-in-depth and API contract issues that should be fixed for consistency with the rest of the codebase.
