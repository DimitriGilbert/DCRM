# Verified Review Report — Cluster 6: Event Engine Core

**Verifier**: Verification Agent  
**Original Report**: `review-report-6.md`  
**Date**: 2026-05-30

---

### Finding 1: `dispatchHooks` returns stale "pending" records for queue-failed dispatches — CONFIRMED

**Original**: When `queue.addJob` throws, the execution record is updated to `"failed"` in the store, but the local `records` array returned to the caller still holds the original `"pending"` record object.

**Verification**: Confirmed with code evidence.

- **`executor.ts:96`** — `createPendingRecord(hook, event)` creates a record with `status: "pending"`.
- **`executor.ts:98`** — `records.push(record)` pushes the "pending" reference into the return array.
- **`executor.ts:112-118`** — The catch block calls `store.updateStatus(record.id, "failed", {...})`, which only updates the **store/persistence layer**, NOT the local `record` object.
- **`executor.ts:121`** — `return records` returns the array containing "pending" records even for failed dispatches.
- **`executor.ts:21-34`** — All fields on `ExecutionRecord` are `readonly`, so the caller cannot even fix the stale status by reassignment (TypeScript enforces this at compile time).
- **`executor.ts:36-47`** — `ExecutionStore.updateStatus` takes `(id, status, details?)` and returns `Promise<void>` — it has no mechanism to return the updated record.

The returned array's contract is broken: `result[i].status === "pending"` even when the store correctly records `"failed"`. This is a silent correctness bug.

---

### Finding 2: Dual retry mechanism desynchronization — `retryCount` never increments on BullMQ retries — CONFIRMED

**Original**: BullMQ retries and custom `shouldRetry` logic are not synchronized. When BullMQ retries a failed job, it re-delivers the original `jobData` with `retryCount: 0`, causing corrupted observability and a perpetually-true `shouldRetry`.

**Verification**: Confirmed with code evidence.

- **`queue.ts:37-43`** — `createBullMQQueueAdapter` sets `attempts: data.maxRetries + 1` and exponential backoff. BullMQ manages its own attempt counter independently.
- **`executor.ts:107`** — `retryCount: 0` is hardcoded in the job data at dispatch time.
- **BullMQ behavior**: On retry, BullMQ re-delivers the **original job payload** unchanged. `jobData.retryCount` remains `0` on every BullMQ retry.
- **`executor.ts:170-173`** — `processJob` constructs a `RetryPolicy` from `jobData.retryCount` (always `0`) and `jobData.maxRetries`. Since `0 < maxRetries` is always true (for any `maxRetries > 0`), `shouldRetry` always returns `true`.
- **`executor.ts:176-179`** — The store is updated with `retryCount: jobData.retryCount + 1` which always writes `1`, never incrementing beyond 1 regardless of actual retry count.
- **`retry.ts:15-17`** — `shouldRetry` implementation: `return policy.retryCount < policy.maxRetries` — trivially confirms the logic.
- **`retry.ts:23-26`** — `getRetryDelayMs` exists but is never called anywhere in the codebase — it's dead code in the BullMQ flow.

The dual mechanism is real: BullMQ owns retry scheduling, but `processJob` returns a `shouldRetry` value that is meaningless and writes `retryCount: 1` to the store on every failure. Any monitoring or UI showing retry progress will be wrong.

---

### Finding 3: `processJob` reconstructs `HookRecord` with hardcoded empty `name` — CONFIRMED

**Original**: `processJob` reconstructs a `HookRecord` from `jobData` and `event`, but `HookJobData` does not carry the hook's `name` field. The reconstruction hardcodes `name: ""`.

**Verification**: Confirmed with code evidence.

- **`hook-resolver.ts:7-16`** — `HookRecord` type includes `name: string` as a required, non-optional field.
- **`queue.ts:6-15`** — `HookJobData` type does NOT include any `name` or `hookName` field.
- **`executor.ts:100-109`** — When `dispatchHooks` constructs `jobData`, it carries `hookId`, `hookType`, etc., but NOT `hook.name`.
- **`executor.ts:153-162`** — When `processJob` reconstructs the `HookRecord`, it hardcodes `name: ""` and `enabled: true` because neither is available in `HookJobData`.

The original hook name is definitively lost during the dispatch-to-process pipeline. Any handler that logs `hook.name`, uses it for audit trails, or branches on it will receive an empty string. The `enabled: true` assumption is also unverified but less critical since the hook was enabled at dispatch time.

---

### Finding 4: `emitEvent` returns `createdAt` generated after DB insert — may diverge from stored value — CONFIRMED

**Original**: `emitEvent` calls `persister.insert(row)` first, then constructs the returned `DcrmEvent` with `createdAt: new Date()`. If the database has a default `created_at` column, the actual persisted timestamp differs from what the caller receives.

**Verification**: Confirmed with code evidence.

- **`emitter.ts:43-55`** — `EventRow` type does NOT include a `createdAt` field. It has `id`, `userId`, `type`, `source`, `entityType`, `entityId`, `payload`, `changes`.
- **`emitter.ts:87`** — `await persister.insert(row)` — inserts without `createdAt`.
- **`emitter.ts:98`** — `createdAt: new Date()` — generates the return timestamp AFTER the DB insert.
- **`automation.ts:99`** — The DB schema defines `createdAt: timestamp("created_at").defaultNow().notNull()` — PostgreSQL generates the actual timestamp via `DEFAULT now()`.
- **`emitter.ts:62-64`** — `EventPersister.insert` returns `Promise<void>` — there is no mechanism to return the DB-generated value.

The divergence is real: the DB records `created_at` at time T1 (when PostgreSQL processes `DEFAULT now()`), and the returned `DcrmEvent.createdAt` is time T2 (when `new Date()` executes after the `await` resolves). Under normal conditions T2 - T1 is sub-millisecond, but under DB replication lag, slow networks, or high load, the gap could be meaningful. More importantly, any caller comparing the returned event's `createdAt` against a DB query result will see a mismatch.

---

## Summary

| Finding | Title | Verdict |
|---------|-------|---------|
| 1 | `dispatchHooks` returns stale "pending" records | **CONFIRMED** |
| 2 | Dual retry mechanism desynchronization | **CONFIRMED** |
| 3 | `processJob` reconstructs `HookRecord` with empty `name` | **CONFIRMED** |
| 4 | `emitEvent` returns divergent `createdAt` | **CONFIRMED** |

**Confirmed: 4 / 4**  
**Dismissed: 0 / 4**

All four findings in the original report are genuine bugs or architectural issues verified against the actual source code. No false positives were identified. The two HIGH-severity findings (#1 stale return values, #2 retry desynchronization) are the most impactful for production reliability.
