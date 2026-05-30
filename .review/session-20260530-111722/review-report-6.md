# Code Review Report — Cluster 6: Event Engine Core

**Reviewer**: Code Reviewer - Cluster 6  
**Date**: 2026-05-30  
**Files Reviewed**: 11 (7 source, 3 test, 1 barrel export)

---

### [SEVERITY: HIGH] Finding 1: `dispatchHooks` returns stale "pending" records for queue-failed dispatches

**File**: `packages/events/src/executor.ts:95-119`

**Problem**: When `queue.addJob` throws, the execution record is correctly updated to `"failed"` in the store (line 115), but the local `records` array that is returned to the caller still holds the original `"pending"` record object. Callers relying on the return value to determine dispatch status receive incorrect data.

**Evidence**:
```typescript
const records: ExecutionRecord[] = [];

for (const hook of hooks) {
    const record = createPendingRecord(hook, event);   // status: "pending"
    await store.insert(record);
    records.push(record);                                // ← pushes "pending" reference

    try {
      await queue.addJob(jobData);
    } catch (err) {
      await store.updateStatus(record.id, "failed", {   // ← updates store, not local array
        error: `Queue dispatch failed: ${queueError}`,
      });
    }
}

return records;   // ← contains "pending" for failed dispatches
```

**Impact**: Any caller that checks `result[n].status` to determine whether a hook was successfully enqueued will see `"pending"` even when the queue dispatch failed and the store correctly records `"failed"`. This breaks the function's contract — the returned data does not reflect reality. Downstream code that decides whether to alert, retry, or compensate based on returned statuses will make wrong decisions.

**Suggestion**: Track dispatch failures locally and either update the record in-place or rebuild the return array from the store after the loop:

```typescript
for (const hook of hooks) {
    const record = createPendingRecord(hook, event);
    await store.insert(record);

    try {
      await queue.addJob(jobData);
      records.push(record);
    } catch (err) {
      const queueError = err instanceof Error ? err.message : String(err);
      await store.updateStatus(record.id, "failed", {
        error: `Queue dispatch failed: ${queueError}`,
      });
      // Push the failed record so the caller can see the truth
      records.push({ ...record, status: "failed", error: `Queue dispatch failed: ${queueError}` });
    }
}
```

Or simpler: after the loop, re-read the records from the store to ensure consistency.

---

### [SEVERITY: HIGH] Finding 2: Dual retry mechanism desynchronization — `retryCount` never increments on BullMQ retries

**File**: `packages/events/src/queue.ts:37-43` + `packages/events/src/executor.ts:170-179`

**Problem**: The package provides two independent retry mechanisms that are not synchronized:
1. **BullMQ retry** (`queue.ts:38`): configured with `attempts: data.maxRetries + 1` and exponential backoff — BullMQ manages its own attempt counter.
2. **Custom retry logic** (`executor.ts:170-179`): `processJob` uses `jobData.retryCount` to call `shouldRetry()` and writes `retryCount + 1` to the store.

When BullMQ retries a failed job, it re-delivers the **original** job data payload. The `retryCount` field inside `HookJobData` remains `0` on every BullMQ retry. This causes two bugs:

- **Observability corruption**: The execution store will record `retryCount: 1` on every failure (`jobData.retryCount + 1` = `0 + 1`), never incrementing beyond 1, regardless of how many actual retries occurred.
- **`shouldRetry` is always true**: Since `jobData.retryCount` is always `0`, `shouldRetry` (`0 < maxRetries`) always returns `true`, making the custom retry logic unable to actually enforce limits. BullMQ's `attempts` config becomes the sole limiter, but the `processJob` return value misleads callers into thinking custom retry logic is functioning.

**Evidence**:
```typescript
// queue.ts — BullMQ will retry, but job data stays unchanged
await queue.add("hook-execution", data, {
  attempts: data.maxRetries + 1,   // BullMQ manages attempts
  backoff: { type: "exponential", delay: 1000 },
});

// executor.ts — reads retryCount from stale job data
const policy: RetryPolicy = {
  maxRetries: jobData.maxRetries,
  retryCount: jobData.retryCount,  // ← always 0 on BullMQ retries
};
const canRetry = shouldRetry(policy);  // ← always true

// Store gets wrong retryCount
await store.updateStatus(jobData.executionId, "failed", {
  retryCount: jobData.retryCount + 1,  // ← always writes 1
});
```

**Impact**: 
- Execution records show incorrect retry counts, breaking any monitoring, alerting, or UI that displays retry progress.
- If a non-BullMQ queue adapter is used (the package exports `QueueAdapter` for this purpose), the consumer must manually re-enqueue with incremented `retryCount`. The package provides `getRetryDelayMs` for this but never uses it — the consumer must discover and wire this themselves, which is error-prone.
- The `shouldRetry` return value from `processJob` is meaningless when BullMQ manages retries.

**Suggestion**: Choose one retry strategy and commit to it. Either:

**Option A** (recommended — BullMQ owns retries): Remove custom retry logic from `processJob`. Use BullMQ's `attemptsMade` (available on the job object in the worker) to track retry count in the store. Remove `shouldRetry` and `getRetryDelayMs` from the public API, or document they are only for non-BullMQ adapters.

**Option B** (custom logic owns retries): Set `attempts: 1` in the BullMQ config (no BullMQ retry). Have the worker re-enqueue with incremented `retryCount` and delay from `getRetryDelayMs` when `processJob` returns `shouldRetry: true`.

---

### [SEVERITY: MEDIUM] Finding 3: `processJob` reconstructs `HookRecord` with hardcoded empty `name`

**File**: `packages/events/src/executor.ts:153-162`

**Problem**: `processJob` reconstructs a `HookRecord` from `jobData` and `event`, but `HookJobData` does not carry the hook's `name` field. The reconstruction hardcodes `name: ""`. Any handler that references `hook.name` (for logging, audit trails, user-facing messages, or conditional logic) receives an empty string.

**Evidence**:
```typescript
const hook: HookRecord = {
    id: jobData.hookId,
    userId: jobData.userId,
    name: "",             // ← always empty, original name is lost
    type: jobData.hookType,
    eventType: event.type,
    enabled: true,        // ← also assumed, not carried from original
    config: jobData.config,
    maxRetries: jobData.maxRetries,
};
```

**Impact**: Handlers that log hook names for debugging, write audit entries, or conditionally branch on hook identity will produce misleading records ("Hook '' executed for client.created") or skip intended logic. The `enabled: true` assumption is also notable — if a hook is disabled between dispatch and processing, the reconstructed record says `enabled: true`, but this is less impactful since the hook was enabled at dispatch time.

**Suggestion**: Add `name` (and optionally `enabled`) to `HookJobData`:

```typescript
export type HookJobData = {
  readonly hookId: string;
  readonly hookType: string;
  readonly hookName: string;   // ← add
  readonly eventId: string;
  // ...
};
```

Then in `dispatchHooks`, include it when creating the job data:

```typescript
const jobData: HookJobData = {
  hookId: hook.id,
  hookType: hook.type,
  hookName: hook.name,   // ← carry through
  // ...
};
```

---

### [SEVERITY: MEDIUM] Finding 4: `emitEvent` returns `createdAt` generated after DB insert — may diverge from stored value

**File**: `packages/events/src/emitter.ts:87-98`

**Problem**: `emitEvent` calls `persister.insert(row)` first (line 87), then constructs the returned `DcrmEvent` with `createdAt: new Date()` (line 98). If the database has a default `created_at` column (e.g., `DEFAULT now()`), the actual persisted timestamp differs from what the caller receives. Since `EventRow` does not include `createdAt`, the function cannot return the DB-generated value.

**Evidence**:
```typescript
await persister.insert(row);           // DB may set created_at = T1

return {
  id,
  type: input.type,
  // ...
  createdAt: new Date(),               // T2, where T2 >= T1
};
```

**Impact**: Callers that use the returned `DcrmEvent.createdAt` for ordering, display, or downstream event correlation may work with a timestamp that is slightly later than the actual DB value. In high-throughput scenarios or under DB replication lag, this delta could be significant enough to cause ordering inconsistencies when events are displayed or correlated across services.

**Suggestion**: Either:
- Include `createdAt` in `EventRow` so the persister can return the actual DB-generated value, and have the persister return it.
- Or accept the approximation and document it clearly in the `DcrmEvent` type: `/** Client-side timestamp. For exact DB time, query the events table. */`

---

## Summary

| Severity | Count | Findings |
|----------|-------|----------|
| CRITICAL | 0     | —        |
| HIGH     | 2     | #1 Stale returned records on queue failure; #2 Dual retry desynchronization |
| MEDIUM   | 2     | #3 Lost hook name in processJob; #4 createdAt divergence |
| LOW      | 0     | —        |

**Total findings: 4**

The two HIGH findings are reliability concerns. Finding #1 means callers cannot trust the return value of `dispatchHooks` to reflect actual dispatch status — a silent correctness bug. Finding #2 is an architectural issue where two retry systems coexist without synchronization, leading to corrupted retry-count observability and a misleading `shouldRetry` return value. Both should be addressed before this package powers production hook execution.
