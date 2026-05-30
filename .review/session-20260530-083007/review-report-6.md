# Code Review Report — Cluster 6: Event Engine

**Reviewer**: Code Reviewer — Cluster 6
**Date**: 2026-05-30
**Scope**: Reliability — retry logic, queue ordering, event type exhaustiveness, provenance tracking, error handling in hook execution

---

## Summary

The event engine is well-structured with clean abstractions (queue adapters, execution stores, provenance tracking). The provenance-based loop suppression is correct and the hook dispatch isolation (fire-all semantics with independent jobs per hook) is sound.

I found **2 issues** that affect reliability. Both relate to the retry execution pipeline.

---

### [SEVERITY: HIGH] Finding 1: `retryCount` is never incremented — retry tracking and `shouldRetry` decision logic are non-functional

**File**: packages/events/src/executor.ts:106, 162-166, 198
**Problem**: `retryCount` is set to `0` at dispatch time and nothing in the entire pipeline ever increments it. The `ExecutionStore.updateStatus` interface (line 38-46) only accepts `status`, `output`, and `error` — it has no parameter for `retryCount`. As a result:

1. `shouldRetry` in `processJob` always receives `retryCount: 0`, so it **always returns `true`** when `maxRetries > 0`, regardless of how many attempts have actually occurred.
2. `ExecutionRecord.retryCount` is permanently `0`, making retry observability broken.
3. `processJob` never throws (all errors are caught and returned as `ProcessJobResult`), so BullMQ's built-in retry via `attempts` never triggers unless the caller manually re-throws.

The BullMQ adapter configures `attempts: maxRetries + 1` (queue.ts:38), but since `processJob` catches everything and returns a result object rather than throwing, BullMQ sees every job as "completed" and never activates its auto-retry. The `shouldRetry` result is the only mechanism, but it's unreliable because its input (`retryCount`) is stale.

**Evidence**:

```ts
// executor.ts:106 — retryCount initialized to 0, never incremented
retryCount: 0,

// executor.ts:162-166 — uses stale retryCount from job data
const policy: RetryPolicy = {
  maxRetries: jobData.maxRetries,
  retryCount: jobData.retryCount, // always 0
};
const canRetry = shouldRetry(policy); // always true when maxRetries > 0
```

```ts
// executor.ts:38-46 — updateStatus cannot update retryCount
readonly updateStatus: (
  id: string,
  status: HookExecutionStatus,
  details?: {
    output?: Record<string, unknown>;
    error?: string;
    // no retryCount field
  },
) => Promise<void>;
```

```ts
// queue.ts:38 — BullMQ attempts config is unused because processJob doesn't throw
attempts: data.maxRetries + 1,
```

**Impact**: Hook executions that fail will either:
- Never retry (if the caller doesn't re-throw based on `shouldRetry`), OR
- Retry based on the caller's interpretation of `shouldRetry`, which always says "yes" even on the last allowed attempt, pushing retry limiting entirely onto the caller with no library-level safety net.

In either case, `ExecutionRecord.retryCount` is meaningless for observability/debugging.

**Suggestion**: Two complementary fixes:

1. **Extend `updateStatus` to accept `retryCount`**, and have `processJob` pass the incremented value:
```ts
// executor.ts — update ExecutionStore type
readonly updateStatus: (
  id: string,
  status: HookExecutionStatus,
  details?: {
    output?: Record<string, unknown>;
    error?: string;
    retryCount?: number;
  },
) => Promise<void>;

// In processJob, update retryCount on failure
await store.updateStatus(jobData.executionId, "failed", {
  error: errorMessage,
  retryCount: jobData.retryCount + 1,
});
```

2. **Document the retry contract** — clarify whether the library expects the caller to update `retryCount` in `HookJobData` before calling `processJob` on retries, or whether the library should manage it. If BullMQ is the retry mechanism, the worker should set `retryCount` from `job.attemptsMade`:
```ts
// Worker code (caller responsibility)
const result = await processJob(
  { ...job.data, retryCount: job.attemptsMade },
  store, handlers, event,
);
```

---

### [SEVERITY: MEDIUM] Finding 2: Partial dispatch failure in `dispatchHooks` leaves orphaned execution records

**File**: packages/events/src/executor.ts:94-111
**Problem**: `dispatchHooks` processes hooks in a sequential loop, performing two side effects per hook: `store.insert(record)` then `queue.addJob(jobData)`. If `queue.addJob` fails for hook N, the execution record for hook N is already persisted in "pending" status with no queue job to process it. The function then throws, preventing cleanup of the orphaned record.

Previous hooks (1..N-1) are already dispatched and unaffected, but the caller receives an error and has no way to determine which hooks succeeded without querying the store directly. There is no transaction wrapping these operations and no cleanup on failure.

**Evidence**:
```ts
// executor.ts:94-111
for (const hook of hooks) {
  const record = createPendingRecord(hook, event);
  await store.insert(record);    // Persists "pending" record
  records.push(record);
  // If addJob throws below, record is orphaned in "pending" state
  await queue.addJob(jobData);   // Can throw if queue is unavailable
}
```

**Impact**: Orphaned "pending" execution records accumulate over time when queue infrastructure has transient failures. These records will never transition to a terminal state (`success`/`failed`), polluting execution monitoring and potentially triggering false alerts. No cleanup mechanism exists.

**Suggestion**: Wrap the dispatch loop in a try/catch that rolls back on failure by transitioning orphaned records to "failed" status:

```ts
export async function dispatchHooks(
  event: DcrmEvent,
  queryFn: HookQueryFn,
  store: ExecutionStore,
  queue: QueueAdapter,
): Promise<readonly ExecutionRecord[]> {
  if (!shouldDispatchHooksForEvent(event)) {
    return [];
  }

  const hooks = await resolveHooks(queryFn, event.type, event.userId);
  const records: ExecutionRecord[] = [];

  try {
    for (const hook of hooks) {
      const record = createPendingRecord(hook, event);
      await store.insert(record);
      records.push(record);

      const jobData: HookJobData = { /* ... */ };
      await queue.addJob(jobData);
    }
    return records;
  } catch (err) {
    // Mark any inserted-but-not-dispatched records as failed
    for (const record of records) {
      await store.updateStatus(record.id, "failed", {
        error: `Dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    throw err;
  }
}
```

Alternatively, enqueue all jobs first and insert records afterward, or use a batch insert + batch enqueue pattern.

---

## Items Reviewed — No Issues Found

- **event-types.ts**: Complete event type catalog with `as const` pattern. `EventType` derived from `EVENT_TYPE` values is exhaustive by construction. Clean.
- **emitter.ts**: `emitEvent` correctly persists via abstraction, returns normalized shape. `EventRow` ↔ `EmitEventInput` mapping is correct.
- **hook-resolver.ts**: `resolveHooks` correctly filters disabled hooks after query. Clean separation from DB layer.
- **provenance.ts**: `shouldDispatchHooksForEvent` correctly implements loop suppression — user-initiated events (no provenance) always dispatch, hook-driven events only dispatch when `emitDownstreamEvents` is true. `createProvenanceTracker` is per-scope (not shared), so nesting is the caller's responsibility.
- **queue.ts**: Noop adapter pattern is clean. BullMQ adapter correctly configures exponential backoff.
- **retry.ts**: `shouldRetry` and `getRetryDelayMs` are correct in isolation. Exponential backoff matches BullMQ's `exponential` type with 1000ms base. Cap at 60s is sensible.
- **Tests**: Well-structured, cover dispatch lifecycle, provenance suppression, retry policy, and failure isolation. Test helpers properly simulate store and queue abstractions.
