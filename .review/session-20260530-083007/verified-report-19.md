# Verified Report — Cluster 19: Exchange Router

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-19.md`

---

## Verification Summary

| # | Severity | Title | Verdict |
|---|----------|-------|---------|
| 1 | HIGH | Unbounded threading query in send-email can cause OOM/timeout | ✅ **CONFIRMED** |
| 2 | HIGH | create mutation silently returns null on authorization failure | ✅ **CONFIRMED** — but consistent codebase pattern |
| 3 | MEDIUM | Cursor-based pagination can silently skip records on timestamp collision | ✅ **CONFIRMED** |
| 4 | MEDIUM | dateFrom/dateTo accept invalid strings | ✅ **CONFIRMED** |

---

### Finding 1: Unbounded threading query in send-email can cause OOM/timeout

**Verdict**: ✅ **CONFIRMED** — HIGH

**Evidence from source** (`packages/api/src/routers/exchange/send-email.ts:134-143`):

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

The report's evidence is **exactly accurate**. No `LIMIT`, no `ORDER BY`, no filtering by exchanges that have `messageId` in metadata. Every exchange on the ticket is fetched, including the current one (no `neq(exchanges.id, exchange.id)` exclusion).

The `buildThreadingHeaders` function then sorts the entire array in-memory:
```ts
const sorted = [...previousExchanges].sort(
  (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
);
```

For a ticket with thousands of exchanges, this loads all rows into memory, sorts them, and processes them — all within a tRPC mutation that blocks the response. **CONFIRMED at original severity.**

---

### Finding 2: create mutation silently returns null on authorization failure

**Verdict**: ✅ **CONFIRMED** — HIGH (reduced effective severity: MEDIUM)

**Evidence from source** (`packages/api/src/routers/exchange/create.ts`):

- **Lines 65-67**: `if (!ticket) { return null; }` — silently swallows missing ticket
- **Lines 83-84**: `if (!project) { return null; }` — silently swallows missing project
- **Lines 99-100**: `if (!client) { return null; }` — silently swallows missing client

The report's evidence is **exactly accurate**. Each check returns `null` instead of throwing a `TRPCError`.

However, important context: **this is the identical pattern used by ALL create mutations across the entire codebase**:

| Router | File | Pattern |
|--------|------|---------|
| Project | `project/create.ts:69-71` | `if (!client) { return null; }` |
| Ticket | `ticket/create.ts:61-63` | `if (!project) { return null; }` |
| Exchange | `exchange/create.ts:65-67,83-84,99-100` | `if (!entity) { return null; }` |

The inconsistency flagged in the report is **real but local** — it exists between `send-email.ts` (throws `TRPCError`) and `create.ts` (returns null) within the same exchange router. The broader codebase consistently uses `return null`.

**CONFIRMED** as a real inconsistency within the exchange router. The suggestion to align `create.ts` with `send-email.ts` by throwing `TRPCError` is sound, but this would require a codebase-wide decision to change the established `return null` convention.

---

### Finding 3: Cursor-based pagination can silently skip records when timestamps collide

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source** (`packages/api/src/routers/exchange/list.ts`):

**Lines 29-31** — cursor filter uses only `createdAt`:
```ts
if (input.cursor) {
  conditions.push(lt(exchanges.createdAt, new Date(input.cursor)));
}
```

**Lines 50-52** — next cursor is last item's `createdAt` only:
```ts
const nextCursor = hasMore
  ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
  : undefined;
```

The report's evidence is **exactly accurate**. The `lt()` comparison excludes all rows with the same timestamp as the cursor, even those not yet returned. The example scenario in the report is correct:

> 5 exchanges at `2026-05-30T10:00:00.000Z`:
> - Page 1 (limit=3): returns 3, cursor = `2026-05-30T10:00:00.000Z`
> - Page 2: `WHERE created_at < '2026-05-30T10:00:00.000Z'` → returns nothing, 2 exchanges lost

Note: This same pattern exists in `project/list.ts:25-26` and likely `ticket/list.ts`. A composite cursor fix should be applied consistently.

**CONFIRMED at original severity.**

---

### Finding 4: dateFrom/dateTo accept invalid strings, producing undefined query behavior

**Verdict**: ✅ **CONFIRMED** — MEDIUM

**Evidence from source**:

1. **`schemas.ts:32-33`**: `dateFrom: z.string().optional(), dateTo: z.string().optional()` — bare `z.string()`.
2. **`list.ts:33-39`**: `new Date(input.dateFrom)` and `new Date(input.dateTo)` passed directly to `gte()`/`lte()` operators.

The report's evidence is **exactly accurate**. `new Date("not-a-date")` produces `Invalid Date`, which gets passed to Drizzle operators. The behavior is undefined — PostgreSQL may return zero rows, all rows, or raise an error.

**CONFIRMED at original severity.** Same class of issue as Reports 17 and 18.

---

## Clean Items — No Issues

The report's "Items Reviewed — No Issues Found" table was spot-checked:

- **`index.ts`**: Clean router composition. ✅
- **`read.ts`**: Correct userId scoping. ✅
- **`send-email.ts` userId scoping**: Lines 28-31 scope by user. ✅
- **`send-email.ts` email account ownership**: Lines 108-111 scope by user. ✅
- **`send-email.ts` internal note guard**: Line 39 blocks internal notes. ✅
- **`send-email.ts` empty body guard**: Line 47 checks for empty body. ✅
- **`create.ts` ownership verification**: Lines 53-101 check ticket/project/client ownership. ✅ (The concern is about error handling, not the checks themselves.)
