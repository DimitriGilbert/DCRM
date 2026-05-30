# Code Review Report - Cluster 16: Lead Router

**Reviewer**: Code Review Expert (Cluster 16)
**Date**: 2026-05-30
**Scope**: `packages/api/src/routers/lead/` — full CRUD, stage updates, conversion, search, soft-delete/restore

---

## Summary

The lead router is well-structured with consistent patterns: all mutations use `protectedProcedure`, user-scoping is applied to every read/write query, input validation uses shared schemas with domain types, and events are emitted for all state changes.

Two real issues were found, both in the **convert** operation — the most business-critical endpoint in this module. The other procedures (create, read, update, update-stage, soft-delete, restore, list, search) follow sound patterns with no significant problems.

---

### [SEVERITY: CRITICAL] Finding 1: Lead conversion is not atomic — partial failure corrupts data

**File**: `packages/api/src/routers/lead/convert.ts:57-76`
**Problem**: The conversion performs three independent database operations (insert client, update lead, reassign attachments) with no transaction wrapping. If any step fails after a prior step succeeds, the database is left in an inconsistent state with no rollback.

**Evidence**:
```typescript
// Step 1: Insert client (line 57)
await db.insert(clients).values(clientRow);

// Step 2: Update lead to mark as converted (line 59-66)
const [updatedLead] = await db
  .update(leads)
  .set({
    convertedClientId: clientId,
    convertedAt: now,
  })
  .where(eq(leads.id, input.id))
  .returning();

// Step 3: Reassign attachments (line 68-76)
await db
  .update(attachments)
  .set({ entityType: "client", entityId: clientId })
  .where(
    and(
      eq(attachments.entityType, "lead"),
      eq(attachments.entityId, input.id),
    ),
  );
```

**Impact**:
- If step 1 succeeds but step 2 fails: an orphaned client record exists with no lead pointing to it. The lead still appears unconvered, so the user might retry, creating a *second* client.
- If steps 1-2 succeed but step 3 fails: the lead is marked converted, but attachments remain linked to the lead entity type instead of the client. They become invisible to the client view.
- No `db.transaction()` is used anywhere in the codebase currently, but this is the one place where it is genuinely required — conversion is an irreversible business operation that must be all-or-nothing.

**Suggestion**: Wrap all three operations in a Drizzle transaction:
```typescript
await db.transaction(async (tx) => {
  await tx.insert(clients).values(clientRow);

  const [updatedLead] = await tx
    .update(leads)
    .set({ convertedClientId: clientId, convertedAt: now })
    .where(eq(leads.id, input.id))
    .returning();

  await tx
    .update(attachments)
    .set({ entityType: "client", entityId: clientId })
    .where(
      and(
        eq(attachments.entityType, "lead"),
        eq(attachments.entityId, input.id),
      ),
    );

  // emit event after transaction commits successfully
});
```

---

### [SEVERITY: HIGH] Finding 2: Race condition allows duplicate lead conversion

**File**: `packages/api/src/routers/lead/convert.ts:33-35`
**Problem**: The conversion check `if (lead.convertedClientId)` is a read-then-write pattern with no row-level locking. Two concurrent conversion requests for the same lead can both read `convertedClientId === null`, both pass the guard, and both create separate client records.

**Evidence**:
```typescript
// Both concurrent requests see this:
if (lead.convertedClientId) {  // null for both
  return null;
}

// Both proceed to create a client:
const clientId = nanoid(); // different IDs
await db.insert(clients).values(clientRow); // two client rows inserted
```

**Impact**:
- Duplicate client records created from the same lead.
- The second `UPDATE leads SET converted_client_id = ...` overwrites the first, so the lead ends up linked to only the second client. The first client is orphaned.
- While the single-user product constraint makes this unlikely (the user would have to double-click or have a network retry), it is a data integrity issue for the most critical business operation in the CRM.

**Suggestion**: Use a transaction with `SELECT ... FOR UPDATE` (or Drizzle equivalent) to lock the lead row during the read, preventing concurrent conversion. Combined with the fix for Finding 1:
```typescript
await db.transaction(async (tx) => {
  // Lock the lead row for the duration of the transaction
  const [lead] = await tx
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.id, input.id),
        eq(leads.userId, ctx.user.id),
        isNull(leads.deletedAt),
      ),
    )
    .limit(1)
    .for("update"); // row-level lock

  if (!lead || lead.stage !== "won" || lead.convertedClientId) {
    return null;
  }
  // ... rest of conversion
});
```

---

## Items Reviewed — No Issues Found

The following files were thoroughly reviewed and contain no significant issues:

- **`index.ts`** — Clean router composition, all procedures registered.
- **`schemas.ts`** — Proper validation with domain types, correct use of nullable/optional for update partial semantics, sensible defaults for list pagination.
- **`create.ts`** — Correct userId scoping, proper null-coalescing for optional fields, event emitted with correct payload.
- **`read.ts`** — Returns lead regardless of soft-delete status (consistent with client router pattern — intentional design to allow viewing deleted items).
- **`update.ts`** — Correct userId scoping on select, proper no-op early return when no fields changed. The update-by-id-only (without re-checking userId) follows the established pattern across all entity routers.
- **`update-stage.ts`** — Correctly checks `isNull(deletedAt)` to prevent stage changes on deleted leads, proper before/after event tracking.
- **`soft-delete.ts`** — Correctly checks `isNull(deletedAt)` to prevent double-deletion, proper event emission.
- **`restore.ts`** — Correctly checks `isNotNull(deletedAt)` to only restore deleted leads.
- **`list.ts`** — Proper cursor-based pagination, correct default to exclude deleted, tag filtering is safe (main query userId scope prevents cross-user leaks).
- **`search.ts`** — Proper userId scoping, excludes deleted, ilike pattern uses parameterized queries (no SQL injection).
- **`procedures.test.ts`** — Comprehensive test coverage across all procedures including edge cases.
- **`schemas.test.ts`** — Thorough schema validation tests including defaults and invalid inputs.
