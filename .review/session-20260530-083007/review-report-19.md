# Code Review Report — Cluster 19: Exchange Router

**Reviewer**: Code Review Expert  
**Date**: 2026-05-30  
**Scope**: `packages/api/src/routers/exchange/`  
**Focus**: Security — email sending authorization, userId scoping, data flow — timeline ordering, email linking to clients

---

## Summary

The exchange router is generally well-structured with proper `userId` scoping on all read queries and the primary exchange fetch in `send-email.ts`. Authorization is enforced at the procedure level via `protectedProcedure`. The email sending flow has sensible guards (blocking internal notes, requiring body content, verifying email account ownership).

That said, I found **4 real issues** ranging from unbounded queries that threaten availability, to silent auth failures that break API contract expectations, to cursor pagination that can silently drop records.

---

### [SEVERITY: HIGH] Finding 1: Unbounded threading query in send-email can cause OOM / timeout

**File**: `packages/api/src/routers/exchange/send-email.ts:134-143`

**Problem**: The threading query fetches **all** exchanges for a ticket with no `LIMIT`. The `buildThreadingHeaders` function then sorts the entire array in-memory. For a ticket with thousands of exchanges (e.g., a long-running support thread), this loads every single row into the Node process, sorts them, and extracts message IDs. There is no upper bound.

**Evidence**:
```ts
const previousExchanges = await db
  .select({
    id: exchanges.id,
    ticketId: exchanges.ticketId,
    metadata: exchanges.metadata,
    createdAt: exchanges.createdAt,
  })
  .from(exchanges)
  .where(eq(exchanges.ticketId, exchange.ticketId));
// No .limit() — fetches every exchange on the ticket
```

And `buildThreadingHeaders` does:
```ts
const sorted = [...previousExchanges].sort(
  (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
);
```

**Impact**: A ticket with 100k+ exchanges would cause the mutation to consume excessive memory and potentially time out. Since this runs inside a tRPC mutation, it blocks the response until complete. This is an availability risk.

**Suggestion**: Add a reasonable `LIMIT` (e.g., 200) and order by `createdAt DESC` so the most recent exchanges (most relevant for threading) are fetched first. Alternatively, since threading only needs exchanges that already have a `messageId` in their metadata, add a filter:

```ts
const previousExchanges = await db
  .select({
    id: exchanges.id,
    ticketId: exchanges.ticketId,
    metadata: exchanges.metadata,
    createdAt: exchanges.createdAt,
  })
  .from(exchanges)
  .where(
    and(
      eq(exchanges.ticketId, exchange.ticketId),
      not(eq(exchanges.id, exchange.id)),  // exclude self
    )
  )
  .orderBy(desc(exchanges.createdAt))
  .limit(200);
```

---

### [SEVERITY: HIGH] Finding 2: create mutation silently returns null on authorization failure

**File**: `packages/api/src/routers/exchange/create.ts:65-67, 83-84, 99-100`

**Problem**: When the user references a ticket, project, or client they don't own, the mutation returns `null` instead of throwing a `TRPCError`. This is inconsistent with the established error pattern in `send-email.ts` (which throws `NOT_FOUND` / `PRECONDITION_FAILED`). The caller receives `{ data: null }` with no error, and cannot distinguish "authorization denied" from "exchange created successfully but returned null" or any other failure mode.

**Evidence**:
```ts
// create.ts:65-67
if (!ticket) {
  return null;  // silently swallows the auth failure
}

// create.ts:83-84
if (!project) {
  return null;  // same pattern
}

// create.ts:99-100
if (!client) {
  return null;  // same pattern
}
```

Compare with `send-email.ts:34-36`:
```ts
if (!exchange) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" });
}
```

**Impact**: 
- API consumers cannot programmatically distinguish between "you don't own this entity" and "operation succeeded but returned nothing".
- Frontend code may silently fail without showing the user an error message.
- Debugging becomes difficult — the user sees nothing happened with no explanation.
- Creates a misleading tRPC contract where the return type is `Exchange | null` on a mutation that should always succeed or throw.

**Suggestion**: Throw a `TRPCError` for each case, matching the pattern in `send-email.ts`:

```ts
if (!ticket) {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Ticket not found or not owned by you",
  });
}
```

---

### [SEVERITY: MEDIUM] Finding 3: Cursor-based pagination can silently skip records when timestamps collide

**File**: `packages/api/src/routers/exchange/list.ts:29-31, 50-52`

**Problem**: The cursor is based solely on `createdAt`. The pagination uses `lt(exchanges.createdAt, cursor)` to get the next page. If two or more exchanges share the exact same `createdAt` timestamp (possible because `new Date()` has millisecond precision and batch imports or rapid creation can produce duplicates), the `lt()` comparison skips **all** exchanges with that timestamp, including ones not yet returned.

**Evidence**:
```ts
// list.ts:29-31 — cursor filter
if (input.cursor) {
  conditions.push(lt(exchanges.createdAt, new Date(input.cursor)));
}

// list.ts:50-52 — next cursor is last item's createdAt
const nextCursor = hasMore
  ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
  : undefined;
```

Example scenario: 5 exchanges all created at `2026-05-30T10:00:00.000Z`:
- Page 1 (limit=3): returns 3 of the 5 exchanges, cursor = `2026-05-30T10:00:00.000Z`
- Page 2: `WHERE created_at < '2026-05-30T10:00:00.000Z'` returns **nothing** — the remaining 2 exchanges are skipped because their `created_at` is NOT strictly less than the cursor

**Impact**: Data silently disappears from paginated results. The user sees 3 out of 5 exchanges with no indication that 2 are missing.

**Suggestion**: Use a composite cursor that includes both `createdAt` and `id` as a tiebreaker:

```ts
// Composite cursor approach:
if (input.cursor) {
  const { createdAt: cursorDate, id: cursorId } = JSON.parse(input.cursor);
  conditions.push(
    or(
      lt(exchanges.createdAt, new Date(cursorDate)),
      and(
        eq(exchanges.createdAt, new Date(cursorDate)),
        lt(exchanges.id, cursorId),
      ),
    )!,
  );
}

// nextCursor:
const nextCursor = hasMore
  ? JSON.stringify({
      createdAt: items[items.length - 1]!.createdAt.toISOString(),
      id: items[items.length - 1]!.id,
    })
  : undefined;
```

This requires a composite index: `index("exchanges_created_at_id_idx").on(table.createdAt, table.id)`.

---

### [SEVERITY: MEDIUM] Finding 4: dateFrom / dateTo accept invalid strings, producing undefined query behavior

**File**: `packages/api/src/routers/exchange/schemas.ts:32-33`  
**Also affects**: `packages/api/src/routers/exchange/list.ts:33-39`

**Problem**: The `dateFrom` and `dateTo` fields are `z.string().optional()` with no validation that they contain valid date strings. When an invalid string like `"not-a-date"` is passed, `new Date("not-a-date")` produces `Invalid Date`, which gets passed to Drizzle's `gte()` / `lte()` operators. The resulting SQL comparison against an invalid date produces undefined behavior — it may return zero rows, all rows, or raise a database error depending on the PostgreSQL configuration.

**Evidence**:
```ts
// schemas.ts:32-33
dateFrom: z.string().optional(),
dateTo: z.string().optional(),

// list.ts:33-39 — used directly without validation
if (input.dateFrom) {
  conditions.push(gte(exchanges.createdAt, new Date(input.dateFrom)));
}
if (input.dateTo) {
  conditions.push(lte(exchanges.createdAt, new Date(input.dateTo)));
}
```

**Impact**: A malformed date filter silently returns wrong data. No error is thrown, so the caller believes the empty/wrong result set is correct. This is a data integrity issue for list queries.

**Suggestion**: Validate date strings in the schema using `z.string().datetime()` or `z.string().date()`, or at minimum add a `z.string().refine()`:

```ts
const dateStringSchema = z.string().refine(
  (val) => !isNaN(new Date(val).getTime()),
  { message: "Invalid date string" },
);

// In listExchangesSchema:
dateFrom: dateStringSchema.optional(),
dateTo: dateStringSchema.optional(),
```

---

## Items Reviewed — No Issues Found

| File | Verdict |
|------|---------|
| `index.ts` | Clean — straightforward router composition |
| `read.ts` | Correct — properly scoped by `userId` |
| `timeline.ts` | Correct — `userId` scoping enforced, `OR` for entity filters is intentional for unified timeline view |
| `schemas.ts` (aside from date fields) | Correct — proper Zod validation with sensible defaults |
| `procedures.test.ts` | Tests align with implementation behavior |
| `schemas.test.ts` | Coverage of validation cases is adequate |
| `send-email.ts` — userId scoping on exchange fetch (line 29) | Correct |
| `send-email.ts` — userId scoping on email account fetch (line 110) | Correct |
| `send-email.ts` — internal note guard (line 39) | Correct |
| `send-email.ts` — empty body guard (line 47) | Correct |
| `send-email.ts` — event emission | Correct — emits `EMAIL_SENT` with proper payload |
| `create.ts` — ownership verification for ticket/project/client | Correct — checks `userId` for all referenced entities |
