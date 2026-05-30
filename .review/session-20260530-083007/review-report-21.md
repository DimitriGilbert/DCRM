# Code Review Report — Cluster 21: Tags & Entity Tags

**Reviewer**: Automated Deep Review
**Date**: 2026-05-30
**Files Reviewed**: 12 files across `routers/tag/` and `routers/entity-tag/`

---

## Summary

Three real issues found. The most significant is a missing authorization check in `detach.ts` — the only mutation in either router that skips `userId` ownership verification. A second issue is an unhandled unique-constraint violation on duplicate attach. A third is the complete absence of `entityType` validation, allowing arbitrary strings as entity types.

---

### [SEVERITY: CRITICAL] Finding 1: detach.ts skips userId ownership check — authorization bypass

**File**: `packages/api/src/routers/entity-tag/detach.ts:10-25`
**Problem**: The `detach` mutation never verifies that the tag being detached belongs to the authenticated user. The `entity_tags` table has no `userId` column — ownership is established transitively through the tag. The sibling `attach.ts` correctly performs this check (lines 12-21: joins to `tags` table and filters by `ctx.user.id`), but `detach.ts` queries `entity_tags` directly with no user scoping. Any authenticated user can detach any entity-tag association by knowing the `tagId`, `entityType`, and `entityId`.

**Evidence**:
```ts
// detach.ts — NO userId check anywhere
export const detachTag = protectedProcedure
  .input(detachTagSchema)
  .mutation(async ({ input }) => {  // ← ctx is destructured away entirely
    const [existing] = await db
      .select()
      .from(entityTags)
      .where(
        and(
          eq(entityTags.tagId, input.tagId),
          eq(entityTags.entityType, input.entityType),
          eq(entityTags.entityId, input.entityId),
        ),
      )
      .limit(1);
```

Compare with `attach.ts` which correctly checks ownership:
```ts
// attach.ts — verifies tag belongs to user
const [tag] = await db
  .select()
  .from(tags)
  .where(
    and(
      eq(tags.id, input.tagId),
      eq(tags.userId, ctx.user.id),  // ← ownership verified
    ),
  )
```

**Impact**: Any authenticated user can detach tags from entities they do not own. Even in a single-user CRM, this is an authorization gap — if session tokens leak, an attacker can disrupt entity-tag associations without needing to own the tags.

**Suggestion**: Add a tag ownership check before performing the delete, mirroring the pattern in `attach.ts`:
```ts
.mutation(async ({ ctx, input }) => {
  // Verify the tag belongs to the current user
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, input.tagId), eq(tags.userId, ctx.user.id)))
    .limit(1);

  if (!tag) {
    return null;
  }

  // ... proceed with existing delete logic
```

---

### [SEVERITY: HIGH] Finding 2: attach.ts has no duplicate prevention — unhandled DB constraint error

**File**: `packages/api/src/routers/entity-tag/attach.ts:38`
**Problem**: The code performs a blind `INSERT` without checking for an existing attachment or wrapping the insert in a try/catch. The database has a unique index `entity_tags_unique_idx ON (tag_id, entity_type, entity_id)` that will reject duplicates. When a client calls `attach` twice for the same tag+entity combination, the raw PostgreSQL unique-constraint error propagates as an `INTERNAL_SERVER_ERROR`, exposing internal DB details in the error message.

**Evidence**:
```ts
// attach.ts — no duplicate check, no error handling
await db.insert(entityTags).values(row);  // line 38 — throws on duplicate

return row;
```

Compare with the unique constraint in the DB schema (`packages/db/src/schema/crm.ts:283`):
```ts
uniqueIndex("entity_tags_unique_idx").on(
  table.tagId,
  table.entityType,
  table.entityId,
),
```

**Impact**: Re-attaching a tag to the same entity returns a 500 error with raw Postgres internals instead of a clean, user-facing response. This is both a poor API contract and a minor information leak.

**Suggestion**: Either check for an existing row before inserting, or catch the constraint violation and return the existing row:

```ts
// Option A: Check first, return existing if found
const [existing] = await db
  .select()
  .from(entityTags)
  .where(
    and(
      eq(entityTags.tagId, input.tagId),
      eq(entityTags.entityType, input.entityType),
      eq(entityTags.entityId, input.entityId),
    ),
  )
  .limit(1);

if (existing) {
  return existing;
}

await db.insert(entityTags).values(row);
return row;
```

---

### [SEVERITY: HIGH] Finding 3: entityType is completely unvalidated — arbitrary entity-type injection

**File**: `packages/api/src/routers/entity-tag/schemas.ts:5,13`
**Problem**: The `entityType` field in both `attachTagSchema` and `detachTagSchema` is `z.string().min(1)` — accepting any arbitrary string. The codebase already has a domain-level enum for valid entity types (`@DCRM/domain` exports `attachmentEntityTypeSchema` with `z.enum(["client", "lead", "project", "ticket", "exchange"])`), but the entity-tag schemas do not use it or any equivalent. This means:
1. Tags can be attached with `entityType: "banana"` — creating orphaned, meaningless associations.
2. Tags can be attached to entity types that don't support tags in the DB relations (e.g., `"lead"` has no `tags: many(entityTags)` relation, `"exchange"` neither).
3. These phantom associations pollute data and will never be cleaned up by any entity-scoped query.

**Evidence**:
```ts
// schemas.ts — accepts any string
export const attachTagSchema = z.object({
  tagId: z.string().min(1),
  entityType: z.string().min(1),    // ← any string accepted
  entityId: z.string().min(1),
});
```

The DB schema in `crm.ts` shows that only `clients`, `projects`, and `tickets` define `tags: many(entityTags)` relations (lines 346, 372, 386). `leads` does NOT. Yet the API allows `"lead"` as an entityType.

**Impact**: Data integrity degradation. Orphaned entity-tag rows that no query can discover. If the app later adds tag-filtering to leads, stale garbage rows from prior `"lead"` attachments would surface unexpectedly.

**Suggestion**: Define a tag-specific entity type enum (excluding `"exchange"` since exchanges don't have a `tags` relation either) and use it in the schemas:

```ts
import { z } from "zod";

const TAGGABLE_ENTITY_TYPES = ["client", "project", "ticket"] as const;
export const taggableEntityTypeSchema = z.enum(TAGGABLE_ENTITY_TYPES);

export const attachTagSchema = z.object({
  tagId: z.string().min(1),
  entityType: taggableEntityTypeSchema,
  entityId: z.string().min(1),
});
```

If leads should be taggable, add the `tags: many(entityTags)` relation to `leadsRelations` and include `"lead"` in the enum.

---

## Non-Issues (Explicitly Reviewed, No Problem Found)

- **Cascade on tag deletion**: The DB FK `entity_tags.tag_id → tags.id` has `onDelete: "cascade"`. Deleting a tag automatically cleans up all entity-tag rows. Correct.
- **userId scoping on tag CRUD**: `create`, `update`, `delete`, and `list` all correctly scope by `ctx.user.id`. Correct.
- **Cursor-based pagination in list**: Uses `createdAt` cursor with `lt` + `desc` ordering, fetches `limit + 1` for has-more detection. Correct.
- **update.ts dynamic field building**: Loses some type safety with `Record<string, unknown>` but is functionally correct — the schema already constrains which fields can appear.
