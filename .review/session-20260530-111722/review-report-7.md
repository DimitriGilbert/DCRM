# Code Review Report — Clusters 7 & 8: AI Core + Adapters

**Reviewer**: Code Review Expert  
**Date**: 2026-05-30  
**Files Reviewed**: 17 files across `packages/ai/src/` and `packages/ai/__tests__/`  
**Focus**: Security (prompt injection), data flow, error handling, provider abstraction correctness, API key handling

---

## Findings: 4

---

### [SEVERITY: HIGH] Finding 1: Insight Record Permanently Incorrect — `applied` Always Stored as `false`

**File**: `packages/ai/src/hook-executor.ts:[297-345]`  
**Problem**: The AI insight record is inserted into the database *before* the entity update is attempted (line 321), and it is hardcoded to `applied: false` (line 317). After a successful entity update, the `applied` local variable is set to `true` (line 342), but the already-persisted insight record is never updated. This means every direct_write insight that succeeds is permanently recorded as `applied: false` in the database, regardless of actual outcome.

**Evidence**:
```typescript
// Line 317: Hardcoded false in the record
const insightRecord: AIInsightRecord = {
  ...
  applied: false,  // <-- always false at insert time
  createdAt: new Date(),
};

// Line 321: Inserted BEFORE the update attempt
await deps.insightStore.insert(insightRecord);

// Lines 330-345: Entity update and success flag — but insight record is never updated
if (...fieldMappingResult.mappedCount > 0) {
  try {
    await deps.entityUpdateFn(...);
    applied = true;  // <-- local variable updated, DB record is NOT
  } catch {
    // Entity update failed; insight remains stored with applied: false
  }
}
```

**Impact**: 
- The `ai_insights` table will show `applied: false` for insights that were actually applied to entities.
- Any UI, audit log, or reconciliation query based on the `applied` column will be wrong.
- Users and operators cannot determine which insights were actually applied vs. just proposed.
- If a retry/recovery mechanism is built on this field, it will re-apply already-applied insights, causing duplicate writes.

**Suggestion**: Insert the insight record *after* the entity update attempt, or perform a follow-up update to set `applied: true` after success. The simplest fix:

```typescript
// Option A: Insert after successful update
await deps.insightStore.insert({
  ...insightRecord,
  applied,  // reflects actual outcome
});

// Option B: Update the record after success
await deps.insightStore.insert(insightRecord);
if (applied) {
  await deps.insightStore.updateApplied(insightId, true);
}
```

---

### [SEVERITY: MEDIUM] Finding 2: Wrong Parameter — `eventType` Passed Instead of `entityType` to Prompt Builder

**File**: `packages/ai/src/hook-executor.ts:[200-204]`  
**Problem**: `buildUserPrompt` is called with `input.eventType` (e.g., `"client.created"`) but the template placeholder `{entityType}` expects the entity kind (e.g., `"client"`). The correct field `input.entityType` exists on the input but is not used here.

**Evidence**:
```typescript
// Line 200-204
const userPrompt = buildUserPrompt(
  resolved.userPromptTemplate,
  input.eventType,      // <-- "client.created" (the event name)
  input.eventPayload,
);

// The template renders as:
// "Summarize the following client.created data..."  ← wrong
// Should be:
// "Summarize the following client data..."          ← correct
```

**Impact**: Every AI hook execution sends a prompt with the event name instead of the entity type. This produces lower-quality AI output because the model sees `"client.created"` as the subject instead of `"client"`. All four built-in templates (`summarize`, `classify`, `extract_contacts`, `enrich_from_web`) use `{entityType}` and are affected.

**Suggestion**: Change line 202 from `input.eventType` to `input.entityType`:

```typescript
const userPrompt = buildUserPrompt(
  resolved.userPromptTemplate,
  input.entityType ?? "entity",  // <-- use entityType, not eventType
  input.eventPayload,
);
```

---

### [SEVERITY: MEDIUM] Finding 3: Entity Update Failure Silently Swallowed — No Logging, No Error Propagation

**File**: `packages/ai/src/hook-executor.ts:[343-345]`  
**Problem**: When a `direct_write` entity update fails (database error, entity deleted, permission issue, validation failure), the error is caught by a bare `catch` block with only a comment. No error is logged, no metric is emitted, and the caller receives `{ applied: false }` with no indication that something went wrong versus the update simply being skipped.

**Evidence**:
```typescript
// Lines 330-345
try {
  await deps.entityUpdateFn(
    input.entityType!,
    input.entityId!,
    input.userId,
    fieldMappingResult.fields,
    {
      hookExecutionId: input.executionId,
      eventId: input.eventId,
      emitDownstreamEvents: input.emitDownstreamEvents,
    },
  );
  applied = true;
} catch {
  // Entity update failed; insight remains stored with applied: false
  // <-- nothing logged, nothing re-thrown, nothing emitted
}
```

**Impact**: Production failures in entity updates (database outages, constraint violations, concurrent modifications) will be completely invisible. Operators cannot debug why AI-driven field updates stop working. The hook executor returns success, the insight is stored, but the entity is unchanged — and nobody knows.

**Suggestion**: At minimum, log the error. Ideally, make the failure mode configurable (re-throw vs. swallow):

```typescript
} catch (error) {
  console.error(
    `[AI Hook] Entity update failed for ${input.entityType}/${input.entityId}`,
    error,
  );
  // Optionally: emit an error event or increment a metric
}
```

---

### [SEVERITY: MEDIUM] Finding 4: `JSON.parse` of AI Text Output Can Produce Non-Object Types

**File**: `packages/ai/src/hook-executor.ts:[263-268]`  
**Problem**: When no output schema is configured, the AI's text response is parsed with `JSON.parse()`. If the AI returns valid JSON that is not an object (e.g., `"null"`, `"[]"`, `"123"`, `"\"string\""`), the result is cast as `Record<string, unknown>` via `as Record<string, unknown>` and passed into field mapping logic, which iterates over `Object.entries()`. For primitive values, `Object.entries(123)` returns `[]`, silently losing data.

**Evidence**:
```typescript
// Lines 263-268
const text = textResult as string;
try {
  structuredOutput = JSON.parse(text) as Record<string, unknown>;
  // JSON.parse("null")       → null       → cast as Record → Object.entries(null) throws
  // JSON.parse("[]")          → []         → cast as Record → Object.entries([]) → []
  // JSON.parse("123")         → 123        → cast as Record → Object.entries(123) → []
  // JSON.parse('"hello"')     → "hello"    → cast as Record → silently wrong
} catch {
  structuredOutput = { raw_text: text };
}
```

**Impact**: Downstream `applyFieldMapping()` iterates `Object.entries(structuredOutput)`, which produces empty results for non-object JSON. The field mapper silently returns `{ fields: {}, mappedCount: 0 }`, and no fields get applied — with no error to indicate the AI returned an unexpected format.

**Suggestion**: Validate that the parsed result is a non-null object before accepting it:

```typescript
try {
  const parsed = JSON.parse(text);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    structuredOutput = parsed as Record<string, unknown>;
  } else {
    structuredOutput = { raw_text: text };
  }
} catch {
  structuredOutput = { raw_text: text };
}
```

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | HIGH | `hook-executor.ts` | Insight `applied` field permanently `false` — data integrity bug |
| 2 | MEDIUM | `hook-executor.ts` | `eventType` used instead of `entityType` in prompt template |
| 3 | MEDIUM | `hook-executor.ts` | Entity update failure silently swallowed — zero observability |
| 4 | MEDIUM | `hook-executor.ts` | `JSON.parse` of AI response can produce non-object, silently loses data |

**Notable: No issues found** in: `index.ts`, `chat.ts`, `types.ts`, `provider-manager.ts`, `structured-output.ts`, `tools/index.ts`, `templates/index.ts`, `field-mapper.ts`, `adapters/google.ts`, `adapters/anthropic.ts`, `adapters/openai.ts`, `adapters/openrouter.ts`, or any test files. The adapter layer, provider management, structured output utilities, tool definitions, and test coverage are clean and well-structured.

All 4 findings are concentrated in `hook-executor.ts`, which is the most complex file in the package and handles the critical path of AI → structured output → entity update. Findings 1 and 2 are the highest priority for fix.
