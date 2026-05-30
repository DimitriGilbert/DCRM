# Verified Code Review Report — Cluster 6: Event Engine

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Source Report**: review-report-6.md
**Scope**: Retry logic, queue ordering, event type exhaustiveness, provenance tracking, error handling in hook execution

---

## Verification Summary

| # | Finding | Severity | Verdict | Notes |
|---|---------|----------|---------|-------|
| 1 | `retryCount` never incremented — retry tracking non-functional | HIGH | **CONFIRMED** | Dead-on accurate. Retry mechanism is completely broken. |
| 2 | Partial dispatch failure leaves orphaned execution records | MEDIUM | **CONFIRMED** | Dead-on accurate. No rollback or cleanup on queue failure. |

---

## Finding 1: `retryCount` is never incremented — retry tracking and `shouldRetry` decision logic are non-functional

**Verdict: CONFIRMED**

### Evidence Trail

I traced the complete retry lifecycle through the source code:

**Step 1 — Dispatch (`executor.ts:94-111`)**: `retryCount` is hardcoded to `0` in the `jobData` payload:
```ts
// executor.ts:106
retryCount: 0,
```

**Step 2 — Process (`executor.ts:125-178`)**: When a handler fails, `processJob` reads `retryCount` from the incoming `jobData` — which is always the value set at dispatch time:
```ts
// executor.ts:162-164
const policy: RetryPolicy = {
  maxRetries: jobData.maxRetries,
  retryCount: jobData.retryCount,  // always 0 on first attempt
};
```

**Step 3 — Store update (`executor.ts:38-46`)**: The `ExecutionStore.updateStatus` interface has **no `retryCount` parameter**. The type signature only accepts `status`, `output`, and `error`. This means even if `processJob` wanted to increment `retryCount` in the store, the interface doesn't support it:
```ts
// executor.ts:38-46
readonly updateStatus: (
  id: string,
  status: HookExecutionStatus,
  details?: {
    output?: Record<string, unknown>;
    error?: string;
    // no retryCount field — confirmed by reading the actual type
  },
) => Promise<void>;
```

**Step 4 — BullMQ retry (`queue.ts:37-38`)**: The BullMQ adapter configures `attempts: data.maxRetries + 1`, which would enable automatic retries. However, since `processJob` catches all errors and returns a `ProcessJobResult` (never throws), BullMQ sees every job as "completed" and **never triggers its built-in retry mechanism**.

**Step 5 — DB schema (`automation.ts:161`)**: The database column `retry_count` exists with `default(0)`, and the API router (`list-executions.ts:29`) reads it for display. But nothing ever updates it beyond the initial `0`.

**Step 6 — Test coverage gap**: The test at line 245-283 (`"reports no retry when max retries exhausted"`) correctly passes `retryCount: 3` to `processJob`, demonstrating that the test knows how to exercise the exhausted case. But no test verifies what happens when `processJob` is called a second time for the same execution — because nothing in the pipeline would ever call it with `retryCount > 0`.

**Step 7 — No worker implementation**: A `grep` for `processJob` across the entire codebase shows it is only called in tests (`hook-execution.test.ts`). No BullMQ `Worker` or consumer code exists that would bridge the gap by reading `job.attemptsMade` and passing it as `retryCount`.

### Verification of Claim Accuracy

| Report Claim | Verified? |
|---|---|
| `retryCount` initialized to 0, never incremented | **YES** — executor.ts:106, 198 confirm hardcoded 0 |
| `updateStatus` cannot update `retryCount` | **YES** — executor.ts:38-46 type has no retryCount field |
| `shouldRetry` always returns true when `maxRetries > 0` | **YES** — shouldRetry({maxRetries:3, retryCount:0}) → `0 < 3` → true, always |
| BullMQ `attempts` config is unused because processJob doesn't throw | **YES** — processJob catches all errors at line 156-177, always returns ProcessJobResult |
| `ExecutionRecord.retryCount` permanently 0 | **YES** — confirmed by store mock test at lines 53-69 which never updates retryCount |
| No caller increments retryCount | **YES** — no Worker/consumer code exists in codebase |

### Impact Assessment

The report's impact description is **accurate and complete**. The retry mechanism is entirely non-functional:

1. **No library-level retry**: `processJob` never throws, so BullMQ retries never trigger.
2. **No manual retry tracking**: `retryCount` is never incremented, so `shouldRetry` always returns `true`.
3. **Broken observability**: The DB `retry_count` column (automation.ts:161) and the API response (`list-executions.ts:29`) always show `0`.
4. **Silent infinite loop risk**: If a caller re-dispatches based on `shouldRetry: true` without its own counter, failed hooks would retry infinitely.

### Suggested Fix Assessment

The report's two-fix suggestion is **sound and well-targeted**:
1. Extending `updateStatus` to accept `retryCount` is the correct library-internal fix.
2. Documenting the retry contract (caller vs. library responsibility) is essential.

An additional complementary fix would be to add a BullMQ worker that maps `job.attemptsMade` to `retryCount` in the `processJob` call, which would make BullMQ's retry mechanism actually functional.

---

## Finding 2: Partial dispatch failure in `dispatchHooks` leaves orphaned execution records

**Verdict: CONFIRMED**

### Evidence Trail

**The dispatch loop (`executor.ts:94-111`)**:
```ts
for (const hook of hooks) {
  const record = createPendingRecord(hook, event);
  await store.insert(record);    // line 96: persists record with status="pending"
  records.push(record);          // line 97

  const jobData: HookJobData = {
    // ...
    retryCount: 0,
    maxRetries: hook.maxRetries,
  };

  await queue.addJob(jobData);   // line 110: can throw
}
```

**Critical ordering**: `store.insert` (line 96) executes **before** `queue.addJob` (line 110). There is no try/catch wrapping the loop body.

**What happens on failure**:
1. If `queue.addJob` throws for hook N, the `store.insert` for hook N has already committed a "pending" record.
2. The error propagates up from the `for` loop, past `dispatchHooks`, to the caller.
3. The function throws without returning `records`, so the caller cannot know which hooks succeeded.
4. The "pending" record for hook N has no corresponding queue job — it is permanently orphaned.
5. Hooks 1..N-1 are correctly dispatched (both record and job exist), but the caller doesn't know this.

**No cleanup mechanism**: There is no try/catch in `dispatchHooks`, no rollback function, and no garbage collection for stale "pending" records.

### Verification of Claim Accuracy

| Report Claim | Verified? |
|---|---|
| Sequential loop with `store.insert` then `queue.addJob` | **YES** — executor.ts:96 then 110 |
| If `queue.addJob` fails for hook N, record N is orphaned | **YES** — no try/catch, no cleanup |
| No transaction wrapping these operations | **YES** — plain sequential loop, no atomicity |
| No cleanup on failure | **YES** — no catch block anywhere in dispatchHooks |
| Caller cannot determine which hooks succeeded | **YES** — function throws, records array never returned |

### Impact Assessment

The report's impact description is **accurate**. Orphaned "pending" records:
- Will never transition to a terminal state (`success`/`failed`)
- Pollute execution monitoring dashboards
- Could trigger false alerts for "stuck pending executions"
- Accumulate over time during transient queue outages

### Suggested Fix Assessment

The report's suggested try/catch with rollback is **the correct approach**. Marking orphaned records as "failed" with an error message is the simplest and most reliable cleanup. The alternative suggestion (enqueue all first, then insert) is also valid but changes the semantics — records would only exist for jobs that were successfully enqueued, which may or may not be the desired behavior.

---

## No-Issue Items Verification

The report listed several files as clean. I verified these claims:

| Item | Report Claim | Verified? |
|---|---|---|
| `event-types.ts` — exhaustive by construction | Complete catalog with `as const` pattern | **YES** — `EventType` derived from `typeof EVENT_TYPE[keyof typeof EVENT_TYPE]`, exhaustive by construction |
| `emitter.ts` — correct persistence abstraction | Clean mapping between `EventRow` and `EmitEventInput` | **YES** — simple insert + return, no issues |
| `hook-resolver.ts` — correct filtering | Filters disabled hooks after query | **YES** — clean `filter` on `hook.enabled`, no issues |
| `provenance.ts` — correct loop suppression | User-initiated always dispatches, hook-driven only when `emitDownstreamEvents` is true | **YES** — simple and correct logic |
| `queue.ts` — clean adapter pattern | Noop adapter for testing, BullMQ adapter with exponential backoff | **YES** — clean abstraction, no issues beyond the retry mechanism (covered by Finding 1) |
| `retry.ts` — correct in isolation | `shouldRetry` and `getRetryDelayMs` are mathematically correct | **YES** — functions are correct; the problem is the caller never passes an incremented `retryCount` |
| Tests — well-structured | Cover dispatch, provenance, retry, failure isolation | **YES** — comprehensive test suite, no issues with test logic itself |

All "no issue" claims are confirmed accurate.

---

## Final Assessment

The review report is **high-quality and accurate**. Both findings are real, well-evidenced, and have meaningful impact on production reliability:

1. **Finding 1 (HIGH)**: The retry mechanism is completely non-functional due to `retryCount` never being incremented. This is a **critical reliability bug** — failed hook executions will never be retried, or if manually retried, will retry infinitely with no limit.

2. **Finding 2 (MEDIUM)**: Orphaned execution records are a real operational concern that will surface during queue infrastructure instability.

Both suggested fixes are appropriate and actionable. No false positives were found in this report.
