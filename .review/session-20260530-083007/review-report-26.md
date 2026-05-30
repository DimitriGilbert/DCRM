# Code Review Report — Cluster 26: Hook Router

**Reviewer**: Code Review Expert  
**Date**: 2026-05-30  
**Files Reviewed**: 10 files in `packages/api/src/routers/hook/`  
**Focus**: Logic — hook configuration validation, insight acceptance workflow, execution history pagination, userId scoping

---

## Summary

The hook router is well-structured with consistent `userId` scoping across all endpoints. The CRUD operations are clean. However, I found **5 real issues** — one significant data integrity gap in the insight acceptance workflow, a TOCTOU race condition, two API contract violations around silent no-op mutations, and a type-safety bypass in the update path.

---

### [SEVERITY: HIGH] Finding 1: accept-insight marks insight as applied without atomically applying the fields to the target entity

**File**: `packages/api/src/routers/hook/accept-insight.ts:44-56`

**Problem**: The `acceptInsight` mutation marks the insight as `applied: true` in the database (line 46-48) and then returns the extracted `fields` to the caller (lines 50-56). The comment on line 9 says "by applying its mapped fields to the entity" — but the code **never actually applies any fields to any entity**. It just returns them and trusts the caller to do it.

This creates a data integrity gap: if the client receives the `applied: true` response but crashes, loses connection, or has a bug before applying the returned fields to the target entity, the insight is permanently stuck in an `applied: true` state with no way to retry or undo. The insight becomes a "ghost" — marked as done, but the entity was never updated.

**Evidence**:
```typescript
// Line 44-48: Marks as applied FIRST
await db
  .update(aiInsights)
  .set({ applied: true })
  .where(eq(aiInsights.id, input.id));

// Lines 50-56: Returns fields for caller to apply — no atomicity
return {
  id: insight.id,
  entityType: insight.entityType,
  entityId: insight.entityId,
  applied: true,
  fields,
};
```

**Impact**: An accepted insight can never be re-applied because the `if (insight.applied)` guard on line 29 will block all subsequent attempts. If the client-side application fails for any reason, the data is lost — the AI-generated mapping result will never reach the entity it was intended for.

**Suggestion**: Either:
1. Apply the fields to the target entity **within the same transaction** as the `applied: true` update, making the acceptance truly atomic. This would require a dynamic entity update based on `entityType` and `entityId`.
2. Or, change the semantics: don't mark as `applied` in this endpoint. Instead, have the field-application endpoint (wherever it lives) mark the insight as applied **after** successfully updating the entity. This endpoint would just be "prepare for acceptance" — returning the fields without flipping the `applied` flag.

---

### [SEVERITY: MEDIUM] Finding 2: accept-insight has a TOCTOU race condition on the applied check

**File**: `packages/api/src/routers/hook/accept-insight.ts:15-48`

**Problem**: The mutation reads the insight, checks `if (insight.applied)` (line 29), and then updates it in a separate database call (lines 45-48). These are two separate database operations with no transaction or atomic constraint. Two concurrent requests could both read `applied: false`, both pass the guard, and both execute the update — defeating the purpose of the double-accept protection.

**Evidence**:
```typescript
// Step 1: READ (line 15)
const [insight] = await db.select().from(aiInsights).where(...);

// Step 2: CHECK (line 29)
if (insight.applied) {
  throw new Error("AI insight already applied");
}

// Step 3: WRITE (line 45) — not atomic with Step 1
await db.update(aiInsights).set({ applied: true }).where(eq(aiInsights.id, input.id));
```

**Impact**: In practice, this is mitigated by the single-user constraint (AGENTS.md: "Single-user CRM"). A user is unlikely to accept the same insight from two tabs simultaneously. However, the code explicitly tries to prevent double-acceptance (the error message, the check), which means the intent is to be idempotent — and the current implementation doesn't guarantee that.

**Suggestion**: Use a single atomic UPDATE with a WHERE clause that includes `applied = false`:
```typescript
const result = await db
  .update(aiInsights)
  .set({ applied: true })
  .where(and(
    eq(aiInsights.id, input.id),
    eq(aiInsights.userId, ctx.user.id),
    eq(aiInsights.applied, false),
  ))
  .returning();

if (!result.length) {
  // Either not found, not owned, or already applied
  throw new Error("AI insight not found or already applied");
}
```

---

### [SEVERITY: MEDIUM] Finding 3: update and delete silently succeed when the target hook doesn't exist or belongs to another user

**File**: `packages/api/src/routers/hook/update.ts:28-38` and `packages/api/src/routers/hook/delete.ts:11-18`

**Problem**: Both `updateHook` and `deleteHook` execute their SQL statements with a `WHERE` clause that includes `userId` scoping, but then unconditionally return `{ id }` without checking if any row was actually affected. If the hook doesn't exist, has already been deleted, or belongs to a different user, the mutation returns a successful response indistinguishable from a legitimate update/delete.

**Evidence** (update.ts):
```typescript
await db
  .update(hooks)
  .set(setValues)
  .where(
    and(
      eq(hooks.id, id),
      eq(hooks.userId, ctx.user.id),  // Could match 0 rows
    ),
  );

return { id };  // Always returns, even if 0 rows affected
```

**Evidence** (delete.ts):
```typescript
await db
  .delete(hooks)
  .where(
    and(
      eq(hooks.id, input.id),
      eq(hooks.userId, ctx.user.id),  // Could match 0 rows
    ),
  );

return { id: input.id };  // Always returns, even if 0 rows deleted
```

**Impact**: Clients receive a 200 OK with `{ id }` even when no mutation occurred. This can mask bugs in the frontend — e.g., a stale ID from a cached list, or a timing issue where the hook was already deleted. The client thinks the operation succeeded when it was silently ignored.

**Suggestion**: Use `.returning()` to verify the mutation affected a row:
```typescript
// For update:
const [updated] = await db
  .update(hooks)
  .set(setValues)
  .where(and(eq(hooks.id, id), eq(hooks.userId, ctx.user.id)))
  .returning({ id: hooks.id });

if (!updated) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Hook not found" });
}
return updated;

// For delete: same pattern with .returning()
```

---

### [SEVERITY: MEDIUM] Finding 4: update.ts bypasses Drizzle's type-safe .set() with Record<string, unknown>

**File**: `packages/api/src/routers/hook/update.ts:13-30`

**Problem**: The update constructs a `setValues` object typed as `Record<string, unknown>`, which erases all column-level type safety when passed to Drizzle's `.set()` method. If a column name is mistyped (e.g., `"eventtype"` instead of `"eventType"`) or a removed column is still referenced, TypeScript won't catch it. The current code happens to have correct column names, but there's no compile-time enforcement.

**Evidence**:
```typescript
const setValues: Record<string, unknown> = {};  // Type safety lost

if (updates.name !== undefined) setValues.name = updates.name;
if (updates.eventType !== undefined) setValues.eventType = updates.eventType;
// ...

await db.update(hooks).set(setValues).where(...);  // No column validation
```

**Impact**: Any future column rename, removal, or typo in the `setValues` assignments would not be caught at compile time. The error would surface at runtime as either a database error or silent data loss.

**Suggestion**: Build a properly typed partial object directly:
```typescript
const updates: Partial<typeof hooks.$inferInsert> = {};
if (input.name !== undefined) updates.name = input.name;
if (input.eventType !== undefined) updates.eventType = input.eventType;
// etc.

await db.update(hooks).set(updates).where(...);
```

---

### [SEVERITY: MEDIUM] Finding 5: listHooks ignores the defined listHooksSchema — filtering is dead code

**File**: `packages/api/src/routers/hook/list.ts:7` and `packages/api/src/routers/hook/schemas.ts:32-36`

**Problem**: The `listHooksSchema` defines filter parameters (`eventType`, `type`, `enabled`) but `list.ts` never uses it. The query takes no input at all — it just returns all hooks for the user. The schema is dead code, and the filtering capability it defines is inaccessible to API consumers.

**Evidence**:
```typescript
// schemas.ts:32-36 — Schema defined with filters
export const listHooksSchema = z.object({
  eventType: z.string().min(1).optional(),
  type: hookTypeSchema.optional(),
  enabled: z.boolean().optional(),
});

// list.ts:7 — Query ignores the schema entirely
export const listHooks = protectedProcedure.query(async ({ ctx }) => {
  // No .input(listHooksSchema), no filtering logic
  const rows = await db
    .select({...})
    .from(hooks)
    .where(eq(hooks.userId, ctx.user.id));
  return rows;
});
```

**Impact**: As the number of hooks grows, returning all hooks without pagination or filtering will degrade performance. The schema clearly intended to support filtering but the implementation was never wired up.

**Suggestion**: Either wire up the schema and implement the filtering:
```typescript
export const listHooks = protectedProcedure
  .input(listHooksSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(hooks.userId, ctx.user.id)];
    if (input.eventType) conditions.push(eq(hooks.eventType, input.eventType));
    if (input.type) conditions.push(eq(hooks.type, input.type));
    if (input.enabled !== undefined) conditions.push(eq(hooks.enabled, input.enabled));

    return db.select({...}).from(hooks).where(and(...conditions));
  });
```
Or, if filtering is not needed, remove the dead `listHooksSchema` from `schemas.ts`.

---

## Files with No Issues

- **`index.ts`**: Clean router assembly, all procedures correctly mounted.
- **`read.ts`**: Proper `userId` scoping with `and()` condition, returns `null` for not-found (correct for a `.query()`).
- **`list-insights.ts`**: Correct filtering with dynamic conditions, proper pagination with `limit`/`offset`, userId scoped, ordered by `createdAt` DESC.
- **`list-executions.ts`**: Same solid pattern as list-insights — dynamic conditions, pagination, userId scoping, ordered by `createdAt` DESC.
- **`schemas.ts`**: Well-defined schemas (aside from the unused `listHooksSchema` noted in Finding 5). The `listExecutionsSchema` and `listInsightsSchema` have proper bounds on `limit` (1-100) and `offset` (≥0).
- **`create.ts`**: Correct `userId` scoping from `ctx.user.id`, proper `null` coercion for optional fields, returns the created object.

---

## Security Notes (Positive)

All 10 endpoints consistently scope data by `ctx.user.id`. The `protectedProcedure` middleware (defined in `packages/api/src/index.ts`) ensures `ctx.user` is always defined before any handler runs. No cross-user data leakage vectors were found.
