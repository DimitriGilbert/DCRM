# Verified Report — Cluster 28: Incoming Webhooks

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Source**: review-report-28.md
**Result**: 4 CONFIRMED / 0 DISMISSED

---

## Finding 1: `hasSecret` always hardcoded to `false`

**Verdict**: ✅ CONFIRMED — Severity: HIGH

**Evidence**: 
- `read.ts` lines 11–29: The SELECT clause (lines 12–22) does NOT include the `secret` column. Line 36: `hasSecret: false` — always false.
- `list.ts` lines 8–21: Same pattern. The SELECT (lines 9–19) omits `secret`. Line 26: `hasSecret: false` with comment `// Placeholder — secrets are not returned`.
- The comment "Placeholder" in list.ts confirms this was intentionally stubbed and never completed.

The comment on read.ts line 33 says "Never expose the secret; only indicate whether one is set" — the intent is correct, but the implementation never actually checks whether a secret exists. Both files need to select the `secret` column (or a derived boolean) and compute `hasSecret` from the actual value.

**Impact**: A user who sets an HMAC secret on their webhook has no confirmation it was stored. They cannot verify their endpoint's security status through the UI.

---

## Finding 2: Untyped `Record<string, unknown>` bypasses Drizzle type safety in update

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `update.ts` line 28: `const setValues: Record<string, unknown> = { updatedAt: new Date() };`
- Lines 32–36 assign fields to this untyped object.
- Line 40: `.set(setValues)` passes the untyped object to Drizzle.

Same pattern confirmed in `packages/api/src/routers/hook/update.ts` line 13. The `Record<string, unknown>` type erases column-level type safety. A typo or non-existent column name would compile without error.

---

## Finding 3: Raw `Error` thrown instead of `TRPCError`

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `update.ts` line 25: `throw new Error("Incoming webhook not found")` → client gets HTTP 500.
- `test-mapping.ts` line 27: `throw new Error("Incoming webhook not found")` → client gets HTTP 500.
- Verified the correct pattern in `exchange/send-email.ts` line 35: `throw new TRPCError({ code: "NOT_FOUND", ... })`.
- Also verified `accept-insight.ts` line 26: `throw new Error("AI insight not found")` — same pattern, same problem (noted in Report 26 findings but not called out as a separate finding).

Both locations should use `TRPCError` with `code: "NOT_FOUND"` to return HTTP 404.

---

## Finding 4: `lastReceivedAt` updated before mode/validation checks

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `incoming.ts` line 211: `await deps.updateLastReceived(webhook.id)` — fires after auth + mapping config validation but BEFORE:
  - Line 214: test mode branch (test requests update the timestamp even though no event is emitted)
  - Line 233: live mode mapping failure check (if mapping fails, the event is NOT emitted but timestamp was already updated)

The execution flow is:
1. Lines 140–206: Authentication, JSON parsing, mapping config validation (all must pass)
2. Line 208: `mapPayload()` runs
3. **Line 211: `updateLastReceived` fires unconditionally** ← the problem
4. Line 214: Test mode returns preview — timestamp was updated but no event
5. Line 233: Live mode mapping failure — event NOT emitted, timestamp WAS updated
6. Line 258: Live mode success — event emitted

For test mode, one could argue the webhook WAS technically received. But for live mode with mapping failures, the timestamp is misleading — it indicates a successful receipt when processing actually failed.

**Note**: Verified that `receiver.ts` line 38–43 implements `updateLastReceived` as a direct DB update, confirming this is not mitigated at the caller level.

---

## Non-Issues Verified

The report's "Non-issues confirmed safe" section was cross-checked:

- **HMAC verification** (`incoming.ts:80–113`): Uses `timingSafeEqual`, length check before comparison. Sound. ✅
- **JSON parsing** (`incoming.ts:170–187`): Validates `typeof parsed === "object"` and rejects arrays/null. Sound. ✅
- **SQL injection**: All queries use Drizzle parameterized queries. ✅
- **Ownership scoping**: All CRUD operations filter by `userId`. ✅
- **Secret stored as plaintext**: Required for HMAC comparison on every request. Standard pattern. ✅
- **receiver.ts not in tRPC router**: Correctly imported by the API route handler as a raw HTTP endpoint. ✅

---

## Summary

| # | Finding | Verdict | Severity |
|---|---------|---------|----------|
| 1 | hasSecret always false | CONFIRMED | HIGH |
| 2 | Record<string, unknown> type bypass | CONFIRMED | MEDIUM |
| 3 | Raw Error → HTTP 500 | CONFIRMED | MEDIUM |
| 4 | lastReceivedAt timing | CONFIRMED | MEDIUM |

**False positives**: 0
