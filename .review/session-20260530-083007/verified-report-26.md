# Verified Report — Cluster 26: Hook Router

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Source**: review-report-26.md
**Result**: 5 CONFIRMED / 0 DISMISSED

---

## Finding 1: accept-insight marks insight as applied without atomically applying fields

**Verdict**: ✅ CONFIRMED — Severity: HIGH

**Evidence**: Read `accept-insight.ts` lines 44–56. The code executes `db.update(aiInsights).set({ applied: true })` at line 45–48, then returns `{ applied: true, fields }` at lines 50–56. No entity update occurs anywhere in the file. The function comment on line 9 says "by applying its mapped fields to the entity" — but the code never does this. If the client crashes after receiving the response, the insight is permanently stuck as `applied: true` with no retry path (blocked by the `if (insight.applied)` guard on line 29).

**Severity Rationale**: HIGH is appropriate. This is a data integrity gap that can cause permanent data loss of AI-generated field mappings.

---

## Finding 2: accept-insight TOCTOU race condition on the applied check

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: Read `accept-insight.ts` lines 15–48. Line 15–23: SELECT reads the insight. Line 29: checks `insight.applied`. Lines 45–48: UPDATE sets `applied: true`. No transaction or atomic constraint wraps these operations. Two concurrent requests could both pass the `applied === false` check.

**Severity Rationale**: Downgraded to MEDIUM. The report correctly notes that the single-user constraint (AGENTS.md: "Single-user CRM") makes this extremely unlikely in practice. However, the code explicitly tries to prevent double-acceptance, so the implementation doesn't match the intent.

---

## Finding 3: update and delete silently succeed when hook doesn't exist

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `update.ts` lines 28–38: The `.update()` at lines 28–36 fires without `.returning()`. Line 38 unconditionally returns `{ id }`.
- `delete.ts` lines 11–18: The `.delete()` at lines 11–18 fires without `.returning()`. Line 20 unconditionally returns `{ id: input.id }`.
- Neither checks affected row count. Clients receive a 200 OK even when 0 rows were mutated.

**Severity Rationale**: MEDIUM is appropriate. The data is scoped by `userId` so there's no security boundary issue, but it masks bugs in the frontend.

---

## Finding 4: update.ts bypasses Drizzle's type-safe .set() with Record<string, unknown>

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: `update.ts` line 13: `const setValues: Record<string, unknown> = {};`. This is passed to `.set(setValues)` on line 30. Column-level type safety is lost — a mistyped column name would compile without error.

**Severity Rationale**: MEDIUM is appropriate. The current column names are correct, so there's no active bug — just a missing compile-time safety net.

---

## Finding 5: listHooks ignores listHooksSchema — filtering is dead code

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `schemas.ts` lines 32–36 define `listHooksSchema` with `eventType`, `type`, and `enabled` filters.
- `list.ts` line 7: `protectedProcedure.query(async ({ ctx }) => {` — no `.input()` call, no filtering.
- Grep confirms `listHooksSchema` is only defined in `schemas.ts` and never imported anywhere in the codebase. It is dead code.

**Severity Rationale**: MEDIUM is appropriate. The schema was clearly intended for use but was never wired up. As hook count grows, the lack of filtering/pagination will become a performance concern.

---

## Summary

| # | Finding | Verdict | Severity |
|---|---------|---------|----------|
| 1 | accept-insight non-atomic apply | CONFIRMED | HIGH |
| 2 | TOCTOU race on applied check | CONFIRMED | MEDIUM |
| 3 | Silent no-op mutations | CONFIRMED | MEDIUM |
| 4 | Record<string, unknown> type bypass | CONFIRMED | MEDIUM |
| 5 | listHooksSchema dead code | CONFIRMED | MEDIUM |

**False positives**: 0
**No-issues files**: Confirmed clean — `index.ts`, `read.ts`, `list-insights.ts`, `list-executions.ts`, `schemas.ts` (aside from dead code), `create.ts`.
