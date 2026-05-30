# Verified Code Review Report — Cluster 2: Database Schema

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-2.md

---

### Finding 1: Broken `many()` Relations for Polymorphic entityTags and attachments — CONFIRMED

**Original**: Six `many()` relation declarations across `clientsRelations`, `projectsRelations`, and `ticketsRelations` reference `entityTags` and `attachments` tables that use a polymorphic `entityType`/`entityId` pattern. The target tables' relations definitions lack corresponding `one()` back to the source tables, making these `many()` declarations invalid.

**Verification/Reason**:

Source code confirms every claim:

1. **clientsRelations** (crm.ts:339-348) — `tags: many(entityTags)` at line 346, `attachments: many(attachments)` at line 347. Confirmed.

2. **projectsRelations** (crm.ts:361-374) — `tags: many(entityTags)` at line 372, `attachments: many(attachments)` at line 373. Confirmed.

3. **ticketsRelations** (crm.ts:376-388) — `tags: many(entityTags)` at line 386, `attachments: many(attachments)` at line 387. Confirmed.

4. **entityTagsRelations** (crm.ts:417-422) — Only defines `one(tags)`. No reverse `one()` to clients, projects, or tickets. Confirmed — the polymorphic `entityType`/`entityId` columns (lines 276-277) cannot be expressed as a static FK for Drizzle's relational query builder.

5. **attachmentsRelations** (crm.ts:424-429) — Only defines `one(user)`. No reverse `one()` to clients, projects, or tickets. Same polymorphic pattern (lines 298-299). Confirmed.

**Severity upheld**: HIGH. The six `many()` declarations are dead-code that will throw at runtime when any consumer attempts `db.query.clients.findFirst({ with: { tags: true } })` (or analogous calls for projects/tickets). Drizzle requires a reverse `one()` for `many()` to resolve JOIN columns. The suggested fix (remove the invalid `many()` calls, query polymorphic tables separately) is correct.

---

### Finding 2: Inconsistent Cascade on exchanges.ticketId — CONFIRMED

**Original**: `exchanges.ticketId` uses `onDelete: "cascade"` while `clientId` and `projectId` use `onDelete: "set null"`. Deleting a ticket silently destroys all linked exchanges (emails, call logs, meeting notes). A cascading chain (project → tickets → exchanges) amplifies this.

**Verification/Reason**:

Source code confirms the inconsistency precisely:

- **crm.ts:219-221** — `clientId: text("client_id").references(() => clients.id, { onDelete: "set null" })` ✓
- **crm.ts:222-224** — `projectId: text("project_id").references(() => projects.id, { onDelete: "set null" })` ✓
- **crm.ts:225-227** — `ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" })` ✓

The cascading chain is also confirmed:
- `tickets.projectId` → `projects.id` with `onDelete: "cascade"` (line 189) — project delete cascade-deletes its tickets.
- When tickets are cascade-deleted, `exchanges.ticketId` CASCADE then destroys linked exchanges.
- The `SET NULL` on `exchanges.projectId` fires first (setting projectId = null), but the exchange is still destroyed by the subsequent ticket cascade. The SET NULL provides no protection.

In a CRM, communication history (exchanges) is high-value data. The inconsistency means ticket/project deletion causes irreversible data loss, while client deletion preserves exchanges. This is almost certainly a bug, not intentional design.

**Severity upheld**: MEDIUM. Real data-loss risk, but only triggers on hard deletion of tickets or projects. If the application uses soft deletes (the schema includes `deletedAt` columns), the risk is reduced. However, direct DB operations or admin actions that hard-delete would trigger this.

---

## Summary

| # | Severity | Verdict | File | Finding |
|---|----------|---------|------|---------|
| 1 | HIGH | **CONFIRMED** | crm.ts | 6 broken `many()` relations on polymorphic entityTags/attachments — runtime error on relational queries |
| 2 | MEDIUM | **CONFIRMED** | crm.ts | `exchanges.ticketId` cascade-deletes communication records; inconsistent with `clientId`/`projectId` set-null pattern |

**Total findings: 2 — 2 confirmed, 0 dismissed**
