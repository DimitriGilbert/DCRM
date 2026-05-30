# Verified Code Review Report — Clusters 24 & 25

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-24.md`
**Outcome**: **4 CONFIRMED / 0 DISMISSED**

---

### Finding 1: Entity-tag attach does not verify entity ownership — CONFIRMED

**Original**: The `attachTag` mutation verifies tag ownership but never verifies entity ownership, allowing any authenticated user to attach their tags to another user's entities.

**Verification**: **REAL — confirmed with code evidence.**

`packages/api/src/routers/entity-tag/attach.ts` lines 21-30 check only tag ownership:

```typescript
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
```

After this check, lines 39-48 directly insert into `entityTags` with the caller-supplied `entityType` and `entityId` — no ownership verification on the entity whatsoever:

```typescript
const row = {
  id,
  tagId: input.tagId,
  entityType: input.entityType,
  entityId: input.entityId,
  createdAt: now,
};
await db.insert(entityTags).values(row);
```

The sibling router `packages/api/src/routers/attachment/upload.ts` (lines 17-49) correctly implements `verifyEntityOwnership()`, which queries the appropriate entity table (`clients`, `leads`, `projects`, `tickets`, `exchanges`) checking both `entityId` and `userId`. All five entity tables have `userId` columns (confirmed in `packages/db/src/schema/crm.ts`: clients line 79, leads line 111, projects line 149, tickets line 184, exchanges line 215), making this check straightforward to implement.

**Authorization bypass is real.** User A can attach their tag to any of User B's entities if they know/can guess the entity ID.

---

### Finding 2: Entity-tag detach does not verify entity ownership — CONFIRMED

**Original**: The `detachTag` mutation verifies tag ownership but not entity ownership. The delete matches on `tagId + entityType + entityId` with no user scoping on the entity.

**Verification**: **REAL — confirmed with code evidence.**

`packages/api/src/routers/entity-tag/detach.ts` lines 11-20 check only tag ownership:

```typescript
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
```

Then lines 26-34 delete without any entity ownership check:

```typescript
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

The delete is constrained to the caller's own `tagId` (since tag ownership was verified), so a user cannot detach *another user's* tags. However, the concern is that a user can detach their tag associations from entities they do not own. While this is less severe than Finding 1 (the user can only manipulate *their own* tag's associations), it still violates the principle that entity-related operations should be scoped to the entity owner. The user is performing an action on an entity they don't own.

**Note on practical severity**: Because the tag must belong to the calling user, the actual cross-user impact is limited. User A can only detach *their own* tags from User B's entities — they cannot detach User B's tags. This is still an authorization gap but lower practical impact than Finding 1. Consider downgrading severity from HIGH to MEDIUM if the entity-tag relationship is purely additive metadata owned by the tag creator. However, if entity detail views aggregate tags from the entity owner's perspective, this remains HIGH.

---

### Finding 3: Tag create does not handle duplicate name constraint — CONFIRMED

**Original**: The `tags` table has a unique index on `(userId, name)` but `create.ts` does not catch the constraint violation, resulting in an unhandled 500 error.

**Verification**: **REAL — confirmed with code evidence.**

`packages/db/src/schema/crm.ts` line 265 defines:

```typescript
uniqueIndex("tags_user_id_name_idx").on(table.userId, table.name),
```

`packages/api/src/routers/tag/create.ts` line 23 performs a bare insert:

```typescript
await db.insert(tags).values(row);
```

No try/catch wraps this call. When a user creates a tag with a name that already exists for their `userId`, PostgreSQL throws error code `23505` (unique_violation). This propagates as an unhandled `INTERNAL_SERVER_ERROR` through tRPC, giving the client a generic 500 with no useful message.

The same project already has an `isUniqueConstraintError()` helper in `packages/api/src/routers/entity-tag/attach.ts` (lines 9-16) that checks for Postgres error code `23505`. The suggested fix (wrap in try/catch, convert to `CONFLICT`) is sound and consistent with existing patterns.

---

### Finding 4: Tag color field accepts arbitrary strings without format validation — CONFIRMED

**Original**: The `color` field in both `createTagSchema` and `updateTagSchema` uses `z.string()` with no format constraints, allowing arbitrary strings.

**Verification**: **REAL — confirmed with code evidence.**

`packages/api/src/routers/tag/schemas.ts`:

```typescript
// Line 5
color: z.string().optional(),

// Line 13
color: z.string().nullable().optional(),
```

Both accept any string. The DB column at `crm.ts` line 256 is `text("color")` — also unconstrained. No max length, no regex, no format validation.

While React's `style` prop sanitizes CSS values (mitigating direct XSS), the concern is valid:
- Garbage data can be stored (e.g., a 10MB string, `<script>` tags, arbitrary text)
- Frontend rendering will break for invalid color values
- If any non-React rendering context ever uses this value (e.g., email templates, PDF generation), it could become an injection vector

MEDIUM severity is appropriate. The fix is straightforward: add a hex color regex like `z.string().regex(/^#[0-9a-fA-F]{6}$/)`. If named colors or other formats are needed, the regex can be expanded accordingly.

---

## Summary

| Finding | Title | Verdict |
|---------|-------|---------|
| 1 | Entity-tag attach does not verify entity ownership | **CONFIRMED** (HIGH) |
| 2 | Entity-tag detach does not verify entity ownership | **CONFIRMED** (HIGH, consider MEDIUM per note) |
| 3 | Tag create does not handle duplicate name constraint | **CONFIRMED** (MEDIUM) |
| 4 | Tag color field accepts arbitrary strings | **CONFIRMED** (MEDIUM) |

**Result: 4 confirmed, 0 dismissed.** All findings are genuine issues present in the source code.
