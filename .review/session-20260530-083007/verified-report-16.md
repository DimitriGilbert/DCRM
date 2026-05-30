# Verified Report — Cluster 16: Lead Router

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-16.md`

---

## Verification Summary

| # | Severity | Title | Verdict |
|---|----------|-------|---------|
| 1 | CRITICAL | Lead conversion is not atomic | ✅ **CONFIRMED** |
| 2 | HIGH | Race condition allows duplicate lead conversion | ✅ **CONFIRMED** |

---

### Finding 1: Lead conversion is not atomic — partial failure corrupts data

**Verdict**: ✅ **CONFIRMED** — CRITICAL

**Evidence from source** (`packages/api/src/routers/lead/convert.ts`):

- **Line 57**: `await db.insert(clients).values(clientRow);` — inserts client record
- **Lines 59-66**: `await db.update(leads).set({...}).where(eq(leads.id, input.id)).returning();` — updates lead
- **Lines 68-76**: `await db.update(attachments).set({...}).where(...)` — reassigns attachments
- **No `db.transaction()` wrapping exists anywhere in the file.**

The report's evidence is **exactly accurate**. Three independent database operations execute sequentially with no transaction boundary. If any step fails after a prior step succeeds, the database is left inconsistent:

- Step 1 succeeds + Step 2 fails → orphaned client record, lead still appears unconverted → retry creates a second client
- Steps 1-2 succeed + Step 3 fails → lead marked converted but attachments remain linked to lead entity, invisible in client view

This is the most business-critical operation in the lead module and genuinely requires atomicity. **CONFIRMED at original severity.**

---

### Finding 2: Race condition allows duplicate lead conversion

**Verdict**: ✅ **CONFIRMED** — HIGH

**Evidence from source** (`packages/api/src/routers/lead/convert.ts`):

- **Line 13-23**: Fetches lead with `eq(leads.id, input.id), eq(leads.userId, ctx.user.id), isNull(leads.deletedAt)` — no row-level lock
- **Line 33-35**: `if (lead.convertedClientId) { return null; }` — read-then-write guard with no serialization
- **Line 37**: `const clientId = nanoid();` — generates unique ID
- **Line 57**: `await db.insert(clients).values(clientRow);` — inserts without lock

The report's evidence is **exactly accurate**. Two concurrent requests for the same lead can both pass the `convertedClientId === null` check and both proceed to create separate client records. The second `UPDATE leads SET converted_client_id = ...` overwrites the first, orphaning the first client.

The report correctly notes the single-user product constraint makes this unlikely (requires double-click or network retry), but it remains a genuine data integrity issue for the most critical business operation. **CONFIRMED at original severity.**

The suggested fix (transaction with `SELECT ... FOR UPDATE` via `.for("update")`) is sound and would address both Finding 1 and Finding 2 simultaneously.

---

## Clean Items — No Issues

The report's "Items Reviewed — No Issues Found" section was spot-checked against source:

- **`schemas.ts`**: Verified proper use of shared domain schemas and correct nullable/optional semantics. ✅
- **`create.ts`**: Verified userId scoping on insert. ✅
- **`read.ts`**: Verified returns lead regardless of soft-delete status — this is **intentional** and consistent with all other entity read endpoints (`client/read.ts`, `ticket/read.ts`, `project/read.ts` all lack `deletedAt` filter). ✅
- **`update.ts`**: Verified userId scoping, no-op early return. The lack of `deletedAt` check is consistent with all other update endpoints codebase-wide. ✅
- **`update-stage.ts`**: Verified `isNull(deletedAt)` guard preventing stage changes on deleted leads. ✅
- **`soft-delete.ts`**: Verified `isNull(deletedAt)` guard. ✅
- **`restore.ts`**: Verified `isNotNull(deletedAt)` guard. ✅
- **`search.ts`**: Verified `isNull(deletedAt)` filter and parameterized `ilike`. ✅
