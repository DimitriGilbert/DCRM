# Verified Review Report — Cluster 19: Email Account Router

**Verification Agent**: Code Review Verification
**Date**: 2026-05-30
**Original Report**: review-report-19.md
**Verdict**: 3 CONFIRMED / 0 DISMISSED

---

### Finding 1: Race Condition in Authorized Address Add — Data Loss via Read-Modify-Write Without Transaction — CONFIRMED

**Original**: Read-modify-write on `authorizedAddresses` array without transaction or row-level lock can cause silent data loss under concurrent access.

**Verification**: The actual source code at `packages/api/src/routers/email-account/add-authorized-address.ts` confirms:

- **Lines 20–33**: SELECT fetches current `authorizedAddresses` — confirmed, no `.for("update")` lock:
  ```typescript
  const [client] = await db
    .select({ id: clients.id, authorizedAddresses: clients.authorizedAddresses })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.userId, ctx.user.id), isNull(clients.deletedAt)))
    .limit(1);
  ```

- **Lines 46–54**: Computed merged array written back without transaction wrapping:
  ```typescript
  const updated = [...existing, ...newPatterns];
  await db.update(clients).set({ authorizedAddresses: updated, updatedAt: new Date() })
    .where(eq(clients.id, input.clientId));
  ```

- **Cross-reference**: The codebase does use `db.transaction` with `.for("update")` in `import/import-clients.ts:54`, `hook/accept-insight.ts:41`, and `lead/convert.ts:13`, confirming the report's claim that this pattern is established elsewhere.

- **Also applies to `remove-authorized-address.ts`**: Lines 30–39 have the same read-modify-write without transaction.

**Verdict**: CONFIRMED. The race condition is real. Two concurrent adds to the same client's authorized addresses will cause one batch to be silently lost.

---

### Finding 2: Raw `Error` Thrown Instead of `TRPCError` — Wrong HTTP Status Codes — CONFIRMED

**Original**: Three locations throw raw `Error` instead of `TRPCError`, causing HTTP 500 responses for user errors (validation failures, not-found).

**Verification**: Actual source code confirms all three locations:

1. `add-authorized-address.ts:15`:
   ```typescript
   throw new Error(`Invalid authorized address pattern: "${pattern}". Use exact email or *@domain.com format.`);
   ```

2. `add-authorized-address.ts:36`:
   ```typescript
   throw new Error("Client not found");
   ```

3. `remove-authorized-address.ts:27`:
   ```typescript
   throw new Error("Client not found");
   ```

- **No `TRPCError` import exists** in either file (imports are: `db`, `clients`, `isValidPattern`/nothing, `eq/and/isNull`, `protectedProcedure`, schemas).
- **Cross-reference**: The `update.ts` file in the same directory does not throw errors at all (returns `null` for not-found), so it doesn't use `TRPCError` either, but the report correctly cites other routers (hook, webhook, exchange) that use `TRPCError` consistently.

**Verdict**: CONFIRMED. All three `throw new Error(...)` calls will be converted by tRPC to `INTERNAL_SERVER_ERROR` (HTTP 500) instead of the appropriate `BAD_REQUEST` or `NOT_FOUND` codes.

---

### Finding 3: UPDATE in Authorized Address Operations Missing `userId` Guard — CONFIRMED

**Original**: The UPDATE statements filter only by `clients.id` without including `userId` or `deletedAt` in the WHERE clause, creating a defense-in-depth gap.

**Verification**: Actual source code confirms:

1. `add-authorized-address.ts:48–54`:
   ```typescript
   await db.update(clients).set({ authorizedAddresses: updated, updatedAt: new Date() })
     .where(eq(clients.id, input.clientId));
   ```
   Only `eq(clients.id, input.clientId)` — no `userId`, no `deletedAt`.

2. `remove-authorized-address.ts:33–39`:
   ```typescript
   await db.update(clients).set({ authorizedAddresses: updated, updatedAt: new Date() })
     .where(eq(clients.id, input.clientId));
   ```
   Same — only `eq(clients.id, input.clientId)`.

3. **Cross-reference with `update.ts:93–101`** in the same directory:
   ```typescript
   await db.update(emailAccounts).set(setValues)
     .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, ctx.user.id)));
   ```
   This includes `userId` in the UPDATE WHERE clause, confirming the inconsistency.

**Verdict**: CONFIRMED. The UPDATE operations omit the ownership and soft-delete checks that the preceding SELECT includes. The SELECT-then-UPDATE gap is not atomic, so a state change between the two operations could lead to modifying a record the user no longer owns.

---

## Verification Summary

| Finding | Title | Verdict |
|---------|-------|---------|
| 1 | Race condition in authorized address add | CONFIRMED |
| 2 | Raw Error thrown instead of TRPCError | CONFIRMED |
| 3 | UPDATE missing userId guard | CONFIRMED |

**Total**: 3 CONFIRMED / 0 DISMISSED
