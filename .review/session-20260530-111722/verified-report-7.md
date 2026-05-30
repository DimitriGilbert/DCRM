# Verified Code Review Report — Clusters 7 & 8: AI Core + Adapters

**Verifier**: Verification Agent
**Original Report**: `review-report-7.md`
**Date**: 2026-05-30
**Source File Inspected**: `packages/ai/src/hook-executor.ts` (357 lines)

---

## Verification Results

---

### Finding 1: Insight Record Permanently Incorrect — `applied` Always Stored as `false` — CONFIRMED

**Original**: The AI insight record is inserted with `applied: false` before the entity update, and never updated afterward.

**Verification**: CONFIRMED — this is a real data integrity bug.

**Code evidence from `hook-executor.ts`:**

1. **Line 317** — hardcoded `false`:
   ```typescript
   const insightRecord: AIInsightRecord = {
     ...
     applied: false,     // always false at insert time
     createdAt: new Date(),
   };
   ```

2. **Line 321** — insert happens BEFORE the entity update:
   ```typescript
   await deps.insightStore.insert(insightRecord);
   ```

3. **Lines 342-345** — `applied` local variable set to `true`, but DB record never updated:
   ```typescript
   await deps.entityUpdateFn(...);
   applied = true;   // only the local variable, not the persisted record
   ```

4. **Lines 86-88** — `AIInsightStore` type has NO update method, confirming the record can never be corrected:
   ```typescript
   export type AIInsightStore = {
     readonly insert: (record: AIInsightRecord) => Promise<void>;
   };
   ```

The `applied` local variable (line 282, line 342) is returned in the result object (line 352), so the *caller* gets the correct value — but the *database* always stores `false`. Any query against `ai_insights.applied` will be wrong for every successful `direct_write` execution.

**Severity**: HIGH — confirmed.

---

### Finding 2: Wrong Parameter — `eventType` Passed Instead of `entityType` to Prompt Builder — CONFIRMED

**Original**: `buildUserPrompt` is called with `input.eventType` (e.g., `"client.created"`) but the template placeholder `{entityType}` expects the entity kind (e.g., `"client"`).

**Verification**: CONFIRMED — wrong field is passed.

**Code evidence from `hook-executor.ts`:**

1. **Lines 200-204** — the call site:
   ```typescript
   const userPrompt = buildUserPrompt(
     resolved.userPromptTemplate,
     input.eventType,      // e.g. "client.created"
     input.eventPayload,
   );
   ```

2. **Lines 162-170** — the function signature and template substitution:
   ```typescript
   function buildUserPrompt(
     template: string,
     entityType: string,    // parameter is named entityType
     payload: Record<string, unknown>,
   ): string {
     return template
       .replace(/\{entityType\}/g, entityType || "entity")
       .replace(/\{payload\}/g, JSON.stringify(payload, null, 2));
   }
   ```

3. **`AIHookExecutionInput` type (lines 57-58)** — both fields exist:
   ```typescript
   readonly eventType: string;    // e.g. "client.created"
   readonly entityType?: string;  // e.g. "client" — THIS is the correct one
   ```

4. **Template examples from `templates/index.ts`** — all use `{entityType}`:
   - `"Summarize the following {entityType} data..."` (line 51)
   - `"Classify the following {entityType} data..."` (line 80)
   - `"Extract all contact information from the following {entityType} data..."` (line 115)
   - `"Enrich the following {entityType} data..."` (line 150)

   With the bug, these render as `"Summarize the following client.created data..."` instead of `"Summarize the following client data..."`.

**Severity**: MEDIUM — confirmed. Every prompt sent to the AI model includes the composite event name instead of the clean entity type, degrading output quality across all built-in templates.

---

### Finding 3: Entity Update Failure Silently Swallowed — No Logging, No Error Propagation — CONFIRMED

**Original**: When a `direct_write` entity update fails, the error is caught by a bare `catch` block with only a comment. No error is logged, no metric is emitted.

**Verification**: CONFIRMED — zero observability for entity update failures.

**Code evidence from `hook-executor.ts`, lines 330-345:**

```typescript
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
}
```

The `catch` block:
- Has no `(error)` parameter — the error object is discarded.
- Contains only a comment — no `console.error`, no logger call, no metric increment.
- Does not re-throw — the function returns normally with `{ applied: false }`.
- The caller has no way to distinguish "update skipped" from "update failed with database error".

**Severity**: MEDIUM — confirmed. Production failures in entity updates will be completely invisible to operators.

---

### Finding 4: `JSON.parse` of AI Text Output Can Produce Non-Object Types — CONFIRMED

**Original**: When no output schema is configured, `JSON.parse()` of the AI's text response can produce non-object types (`null`, arrays, numbers, strings) which are then incorrectly cast as `Record<string, unknown>`.

**Verification**: CONFIRMED — the finding is even worse than reported because `null` causes a runtime crash.

**Code evidence from `hook-executor.ts`, lines 263-268:**

```typescript
const text = textResult as string;
try {
  structuredOutput = JSON.parse(text) as Record<string, unknown>;
} catch {
  structuredOutput = { raw_text: text };
}
```

**Runtime verification** (node.js test):

| AI returns `text` | `JSON.parse(text)` result | Downstream behavior in `applyFieldMapping` |
|---|---|---|
| `"null"` | `null` | `Object.entries(null)` **throws TypeError** — unhandled crash |
| `"[]"` | `[]` (array) | `Object.entries([])` → `[]` — silently loses data |
| `"123"` | `123` (number) | `Object.entries(123)` → `[]` — silently loses data |
| `'"hello"'` | `"hello"` (string) | `Object.entries("hello")` → char entries — garbage data |
| `'{"a":1}'` | `{a:1}` (object) | Works correctly |

The `as Record<string, unknown>` on line 265 is a TypeScript type assertion that provides zero runtime safety. Downstream, `collectLeafKeys()` in `field-mapper.ts` (line 118) calls `Object.entries(obj)`, which:
- **Crashes** for `null` (TypeError: Cannot convert undefined or null to object)
- **Returns empty** for arrays and numbers (silently losing all AI output)
- **Returns garbage** for strings (character-level entries)

**Severity**: MEDIUM — confirmed, elevated concern for the `null` crash path.

---

## Summary

| # | Title | Verdict | Severity |
|---|-------|---------|----------|
| 1 | Insight `applied` field permanently `false` | **CONFIRMED** | HIGH |
| 2 | `eventType` used instead of `entityType` in prompt | **CONFIRMED** | MEDIUM |
| 3 | Entity update failure silently swallowed | **CONFIRMED** | MEDIUM |
| 4 | `JSON.parse` can produce non-object types | **CONFIRMED** | MEDIUM |

**Results: 4 confirmed, 0 dismissed.**

All 4 findings are real bugs in `hook-executor.ts`. Finding 1 is a data integrity issue that will corrupt the `ai_insights` table. Finding 2 degrades all AI prompt quality. Finding 3 eliminates production observability for entity write failures. Finding 4 causes silent data loss or unhandled crashes depending on the AI model's response format.
