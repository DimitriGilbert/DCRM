# Code Review Report — Clusters 24 & 25

**Reviewer**: Code Review Agent (Automated)
**Date**: 2026-05-30
**Scope**: Tag CRUD, Entity-Tag association, Notifications, User Settings
**Files Reviewed**: 23 files across `packages/api/src/routers/{tag,entity-tag,notification,settings}/`

---

## Summary

**4 findings** — 2 HIGH, 2 MEDIUM

The tag CRUD, notification, and settings routers are well-structured with consistent `userId` scoping. The critical gap is in **entity-tag attach/detach**, which verifies tag ownership but **does not verify entity ownership** — a pattern that the sibling `attachment` router correctly implements via `verifyEntityOwnership()`.

---

### [SEVERITY: HIGH] Finding 1: Entity-tag attach does not verify entity ownership

**File**: `packages/api/src/routers/entity-tag/attach.ts:20-48`
**Problem**: The mutation verifies that the *tag* belongs to the current user (lines 21-33) but never verifies that the *entity* (client, lead, project, ticket, exchange) belongs to the current user. Any authenticated user can attach their tag to any other user's entity if they know the entity ID.

This is a direct authorization gap. The sibling router `packages/api/src/routers/attachment/upload.ts` correctly implements a `verifyEntityOwnership()` function (lines 25-37) that checks both `entityId` and `userId` against the appropriate entity table. The entity-tag router should follow the same pattern.

**Evidence**:
```typescript
// attach.ts — only checks tag ownership
const [tag] = await db
  .select()
  .from(tags)
  .where(
    and(
      eq(tags.id, input.tagId),
      eq(tags.userId, ctx.user.id),
    ),
  )
  .limit(1);

if (!tag) {
  return null;
}

// NO entity ownership check here — directly inserts
const row = {
  id,
  tagId: input.tagId,
  entityType: input.entityType,
  entityId: input.entityId,
  createdAt: now,
};
await db.insert(entityTags).values(row);
```

**Impact**: User A can attach their tags to User B's clients, leads, projects, tickets, or exchanges. This pollutes User B's data view (if their entity detail queries join through entity_tags) and creates phantom associations with no recourse for the entity owner.

**Suggestion**: Add the same `verifyEntityOwnership` pattern used in `attachment/upload.ts`. Either import the function from a shared location or duplicate the pattern inline:

```typescript
// Reuse the pattern from attachment/upload.ts
const ENTITY_TABLES = {
  client: clients,
  lead: leads,
  project: projects,
  ticket: tickets,
  exchange: exchanges,
} as const;

async function verifyEntityOwnership(
  entityType: keyof typeof ENTITY_TABLES,
  entityId: string,
  userId: string,
): Promise<boolean> {
  const table = ENTITY_TABLES[entityType];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.userId, userId)))
    .limit(1);
  return !!row;
}

// Then in the mutation, after the tag ownership check:
const owned = await verifyEntityOwnership(input.entityType, input.entityId, ctx.user.id);
if (!owned) {
  return null;
}
```

---

### [SEVERITY: HIGH] Finding 2: Entity-tag detach does not verify entity ownership

**File**: `packages/api/src/routers/entity-tag/detach.ts:10-36`
**Problem**: Same as Finding 1 — the detach mutation verifies tag ownership but not entity ownership. A user can detach their tag from any entity regardless of who owns that entity. Additionally, the delete on lines 26-34 matches only on `tagId + entityType + entityId` with no user scoping at all, meaning the delete itself is not constrained.

**Evidence**:
```typescript
// detach.ts — only checks tag ownership
const [tag] = await db
  .select()
  .from(tags)
  .where(
    and(
      eq(tags.id, input.tagId),
      eq(tags.userId, ctx.user.id),
    ),
  )
  .limit(1);

if (!tag) {
  return null;
}

// Deletes by tagId + entityType + entityId — no entity ownership check
await db
  .delete(entityTags)
  .where(
    and(
      eq(entityTags.tagId, input.tagId),
      eq(entityTags.entityType, input.entityType),
      eq(entityTags.entityId, input.entityId),
    ),
  );
```

**Impact**: Symmetric to Finding 1 — cross-user data manipulation. User A can remove their tag associations from User B's entities, or create associations (via attach) then remove them, all without the entity owner's consent or knowledge.

**Suggestion**: Same fix as Finding 1 — add `verifyEntityOwnership` check before the delete. Consider extracting the function to a shared module (e.g., `packages/api/src/utils/verify-entity-ownership.ts`) so both `attach.ts`, `detach.ts`, and `attachment/upload.ts` can reuse it.

---

### [SEVERITY: MEDIUM] Finding 3: Tag create does not handle duplicate name constraint

**File**: `packages/api/src/routers/tag/create.ts:23`
**Problem**: The `tags` table has a unique index on `(userId, name)` (`tags_user_id_name_idx`), but the create mutation does not catch the unique constraint violation. If a user creates two tags with the same name, the raw database error propagates as an unhandled `INTERNAL_SERVER_ERROR` instead of a meaningful error.

**Evidence**:
```typescript
// schemas.ts — the schema allows any string for name
export const createTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

// create.ts — no try/catch around the insert
await db.insert(tags).values(row);
```

The `entity-tag/attach.ts` already defines an `isUniqueConstraintError()` helper for the same purpose (Postgres error code `23505`). The same pattern should be applied here.

**Impact**: Users get a generic 500 error when attempting to create a tag with a duplicate name. No data corruption — the DB constraint protects integrity — but the UX is poor and the error message is unhelpful.

**Suggestion**: Wrap the insert in a try/catch and convert the unique constraint violation into a tRPC `CONFLICT` error:

```typescript
import { TRPCError } from "@trpc/server";

try {
  await db.insert(tags).values(row);
} catch (error: unknown) {
  if (isUniqueConstraintError(error)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A tag with this name already exists",
    });
  }
  throw error;
}
```

Alternatively, do a pre-check query before insert (same pattern used in `update.ts` and `delete.ts`).

---

### [SEVERITY: MEDIUM] Finding 4: Tag color field accepts arbitrary strings without format validation

**File**: `packages/api/src/routers/tag/schemas.ts:5`
**Problem**: The `color` field in both `createTagSchema` and `updateTagSchema` uses `z.string()` with no format constraints. This allows any arbitrary string (e.g., `"hello"`, `<script>alert(1)</script>`, a 10MB string) to be stored as a color value. While the DB column is `text` and won't reject it, the frontend likely expects a hex color code (e.g., `#ff0000`), and invalid values could cause rendering issues or XSS if the value is used in an `innerHTML` or style context.

**Evidence**:
```typescript
export const createTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),       // ← no format constraint
});

export const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  color: z.string().nullable().optional(),  // ← no format constraint
});
```

**Impact**: Garbage data in the `color` column. If the frontend uses the value in a `style` attribute (e.g., `style={{ color: tag.color }}`), most React frameworks sanitize this, but if it's ever rendered in an unsafe context, it could be an XSS vector. More practically: the UI will break for tags with invalid colors.

**Suggestion**: Add a hex color regex validation:

```typescript
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color (e.g., #ff0000)");

export const createTagSchema = z.object({
  name: z.string().min(1),
  color: hexColorSchema.optional(),
});
```

---

## Files with No Issues

The following files were reviewed and found to be correctly implemented:

- **`packages/api/src/routers/tag/index.ts`** — Clean router composition.
- **`packages/api/src/routers/tag/read.ts`** — File does not exist (intentionally omitted from router).
- **`packages/api/src/routers/tag/update.ts`** — Proper ownership check before update, dynamic field building is correct.
- **`packages/api/src/routers/tag/delete.ts`** — Proper ownership check before delete, cascade handled by DB FK.
- **`packages/api/src/routers/tag/list.ts`** — Correct cursor-based pagination with userId scoping.
- **`packages/api/src/routers/tag/schemas.test.ts`** — Good coverage of schema validation cases.
- **`packages/api/src/routers/entity-tag/index.ts`** — Clean router composition.
- **`packages/api/src/routers/entity-tag/schemas.ts`** — Proper reuse of `attachmentEntityTypeSchema` from `@DCRM/domain`.
- **`packages/api/src/routers/notification/index.ts`** — Clean router composition with type exports.
- **`packages/api/src/routers/notification/list.ts`** — Correct pagination, userId scoping, and unread filter.
- **`packages/api/src/routers/notification/mark-read.ts`** — Proper userId scoping in WHERE clause.
- **`packages/api/src/routers/notification/mark-all-read.ts`** — Proper userId scoping.
- **`packages/api/src/routers/notification/schemas.ts`** — Clean schema definitions with sensible defaults.
- **`packages/api/src/routers/settings/index.ts`** — Clean router composition.
- **`packages/api/src/routers/settings/get-settings.ts`** — Proper userId scoping, returns null for missing settings.
- **`packages/api/src/routers/settings/update-theme.ts`** — Correct upsert pattern with `onConflictDoUpdate`.
- **`packages/api/src/routers/settings/update-locale.ts`** — Correct upsert pattern with `onConflictDoUpdate`.
- **`packages/api/src/routers/settings/complete-onboarding.ts`** — Idempotency check + upsert, proper defaults.
- **`packages/api/src/routers/settings/schemas.ts`** — Proper enum validation for theme, reasonable locale constraints.
