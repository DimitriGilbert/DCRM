# Code Review Report — Cluster 2: Database Schema

**Reviewer**: Code Review Expert (Cluster 2)
**Date**: 2026-05-30
**Files Reviewed**: 7 files (db index, schema index, auth schema, CRM schema, automation schema, 2 test files)

---

### [SEVERITY: HIGH] Finding 1: Broken `many()` Relations for Polymorphic entityTags and attachments

**File**: packages/db/src/schema/crm.ts:[346-348] (clientsRelations), [371-373] (projectsRelations), [385-387] (ticketsRelations)

**Problem**: Six `many()` relation declarations reference tables that use a polymorphic association pattern (`entityType` + `entityId`), but the target tables (`entityTags`, `attachments`) have no corresponding `one()` relation back to the source tables. Drizzle's relational query builder requires a reverse `one()` to infer the JOIN columns. Without it, every relational query using these relations throws a runtime error.

**Evidence**:

```typescript
// clientsRelations — lines 346-348
tags: many(entityTags),        // ❌ entityTags has no one(clients)
attachments: many(attachments), // ❌ attachments has no one(clients)

// projectsRelations — lines 371-373
tags: many(entityTags),        // ❌ same problem
attachments: many(attachments), // ❌ same problem

// ticketsRelations — lines 385-387
tags: many(entityTags),        // ❌ same problem
attachments: many(attachments), // ❌ same problem
```

The reverse relations are missing because the target tables use polymorphic FKs — there is no static FK column to define a `one()` against:

```typescript
// entityTagsRelations — only has one(tags), no one(clients/projects/tickets)
export const entityTagsRelations = relations(entityTags, ({ one }) => ({
  tag: one(tags, {
    fields: [entityTags.tagId],
    references: [tags.id],
  }),
}));

// attachmentsRelations — only has one(user), no one(clients/projects/tickets)
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  user: one(user, {
    fields: [attachments.userId],
    references: [user.id],
  }),
}));
```

**Confirmed runtime error** (tested with drizzle-orm 0.45.2):
```
Error: There is not enough information to infer relation "clients.tags"
    at normalizeRelation (drizzle-orm/src/relations.ts:631:8)
```

This error fires on *every* relational query that uses `with: { tags: true }` or `with: { attachments: true }` against clients, projects, or tickets. The schema loads without complaint; the failure is deferred to query-build time.

**Impact**: Any API endpoint or server function that attempts to load a client/project/ticket with its tags or attachments via Drizzle's relational query API (`db.query.clients.findMany({ with: { tags: true } })`) will throw. This affects 6 relation paths across 3 core CRM entities — effectively blocking a primary use case (loading entities with their tags/attachments in a single query).

**Suggestion**: Remove the six invalid `many()` declarations. Polymorphic associations cannot be expressed through Drizzle's relational query builder. Instead, query tags and attachments separately using the polymorphic filter pattern:

```typescript
// Remove these from clientsRelations, projectsRelations, ticketsRelations:
//   tags: many(entityTags),
//   attachments: many(attachments),

// At query time, load tags/attachments in a separate call:
const [client, tags, attachments] = await Promise.all([
  db.query.clients.findFirst({ where: eq(clients.id, clientId) }),
  db.select().from(entityTags).where(
    and(eq(entityTags.entityType, 'client'), eq(entityTags.entityId, clientId))
  ),
  db.select().from(attachments).where(
    and(eq(attachments.entityType, 'client'), eq(attachments.entityId, clientId))
  ),
]);
```

Alternatively, if a helper is desired, create a utility function that composes these parallel queries. The key constraint is that Drizzle's `many()`/`one()` system requires static FK columns — it cannot handle dynamic `entityType`/`entityId` polymorphism.

---

### [SEVERITY: MEDIUM] Finding 2: Inconsistent Cascade on exchanges.ticketId Silently Deletes Communication History

**File**: packages/db/src/schema/crm.ts:[225-227]

**Problem**: The `exchanges` table applies three different `onDelete` strategies for its optional foreign keys. `clientId` and `projectId` use `set null` (preserving the exchange record), but `ticketId` uses `cascade` (destroying the exchange). This means deleting a ticket silently cascade-deletes all associated exchanges (emails, call logs, meeting notes), while deleting a client or project preserves them.

**Evidence**:

```typescript
// Line 219-221: clientId — set null (preserves exchange)
clientId: text("client_id").references(() => clients.id, {
  onDelete: "set null",
}),

// Line 222-224: projectId — set null (preserves exchange)
projectId: text("project_id").references(() => projects.id, {
  onDelete: "set null",
}),

// Line 225-227: ticketId — cascade (DELETES exchange)
ticketId: text("ticket_id").references(() => tickets.id, {
  onDelete: "cascade",
}),
```

Additionally, there's a cascading chain interaction: when a project is hard-deleted → its tickets cascade-delete → ticket exchanges cascade-delete. So project deletion can indirectly destroy exchanges that were *not* directly linked to the deleted project via `projectId`, but only through their ticket association. The `set null` on `projectId` never gets a chance to protect those exchanges.

**Impact**: A user deleting a ticket (or a project whose cascade deletes tickets) will irreversibly lose all linked communication records — emails, meeting notes, call logs. In a CRM, these are high-value data that users expect to persist. The inconsistency with client/project deletion behavior makes this surprising and likely a data-loss bug rather than an intentional design choice.

**Suggestion**: Change `exchanges.ticketId` to `onDelete: "set null"` to match the pattern used for `clientId` and `projectId`:

```typescript
ticketId: text("ticket_id").references(() => tickets.id, {
  onDelete: "set null",
}),
```

This preserves all exchange records regardless of which entity they were linked to, consistent with the behavior for client and project references. A migration will be needed:

```sql
ALTER TABLE exchanges DROP CONSTRAINT exchanges_ticket_id_tickets_id_fk;
ALTER TABLE exchanges ADD CONSTRAINT exchanges_ticket_id_tickets_id_fk
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL ON UPDATE NO ACTION;
```

---

## Summary

| # | Severity | File | Finding |
|---|----------|------|---------|
| 1 | HIGH | crm.ts | 6 broken `many()` relations on polymorphic entityTags/attachments — runtime error on any relational query using them |
| 2 | MEDIUM | crm.ts | `exchanges.ticketId` cascade-deletes communication records; inconsistent with `clientId`/`projectId` set-null pattern |

**Total findings: 2** (1 HIGH, 1 MEDIUM)
