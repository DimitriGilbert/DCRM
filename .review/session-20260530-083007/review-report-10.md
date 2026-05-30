# Code Review Report — Cluster 10: AI Engine Core

**Reviewer**: Automated Deep Review  
**Date**: 2026-05-30  
**Files Reviewed**: 13 files across `packages/ai/src/` and `packages/ai/__tests__/`

---

## Summary

Reviewed AI chat orchestration, structured output generation, provider management, hook executor, field mapping, tool definitions, and prompt templates. The codebase is well-structured with clear separation of concerns. Found **one HIGH severity bug** in the hook executor's structured output path, and **one MEDIUM severity issue** in chat result handling.

---

### [SEVERITY: HIGH] Finding 1: Wrong variable passed to `buildStructuredOutputConfig` — structured output is broken for all AI hooks

**File**: `packages/ai/src/hook-executor.ts:247-249`  
**Problem**: The entire `resolved` template config object `{ systemPrompt, userPromptTemplate, outputSchema, fieldMapping }` is passed to `buildStructuredOutputConfig` instead of just `resolved.outputSchema`. This means the AI provider receives a garbage "schema" containing prompt strings and field mappings instead of the actual output schema. The structured output feature for AI hooks is completely non-functional at runtime.

**Evidence**:
```typescript
// Line 196 — resolved is the FULL config object:
const resolved = resolveTemplateOverrides(input.config);
// resolved = { systemPrompt: "...", userPromptTemplate: "...", outputSchema: ZodSchema, fieldMapping: {} }

// Lines 246-249 — WRONG: passes `resolved` instead of `resolved.outputSchema`
if (resolved.outputSchema) {
  const structuredConfig = buildStructuredOutputConfig(
    resolved as unknown as import("zod").ZodType<Record<string, unknown>>,
  );
```

Tracing the runtime execution through TanStack AI's `convertSchemaToJsonSchema` (schema-converter.js line 64-98):
1. `resolved` is not a Standard Schema (no `~standard` property at top level) — `isStandardSchema` returns `false`
2. `resolved` is an object, so it falls through to the passthrough branch: `return schema`
3. `structuredConfig.schema` = the entire `resolved` object
4. This is then passed to `chat({ outputSchema: ... })` which sends it to the AI provider
5. The AI provider receives `{ systemPrompt, userPromptTemplate, outputSchema, fieldMapping }` as its "JSON Schema" — which is not valid JSON Schema

**Impact**: Every AI hook that uses an output schema (which is all template-based hooks: summarize, classify, extract_contacts, enrich_from_web) sends an invalid schema to the AI provider. Depending on the provider, this will either cause an API error, produce completely unpredictable output, or silently ignore the schema and return unstructured text. The `validate` function in `structuredConfig` is also broken — calling `resolved.parse()` would throw since `resolved` is not a Zod schema. Tests pass only because `chat` is fully mocked and never validates the schema parameter.

**Suggestion**: The entire `buildStructuredOutputConfig` intermediary is unnecessary — TanStack AI's `chat()` accepts `outputSchema` as a `SchemaInput` (which includes Zod schemas, Standard JSON Schema, or plain `JSONSchema`). Pass `resolved.outputSchema` directly:

```typescript
if (resolved.outputSchema) {
  const result = await chat({
    ...chatOptions,
    outputSchema: resolved.outputSchema as import("@tanstack/ai").SchemaInput,
  });
  structuredOutput = result as Record<string, unknown>;
} else {
```

This works correctly because:
- When from a template: `resolved.outputSchema` is a Zod v4 schema — TanStack AI converts it internally via `convertSchemaToJsonSchema(outputSchema, { forStructuredOutput: true })`
- When custom: `resolved.outputSchema` is a plain JSON Schema object — TanStack AI's `SchemaInput` union includes `JSONSchema`

---

### [SEVERITY: MEDIUM] Finding 2: Chat result type handling may silently produce incorrect output

**File**: `packages/ai/src/chat.ts:124`  
**Problem**: The `chat()` function's return type handling uses a `typeof result === "string"` check, but TanStack AI's `chat()` with `stream: false` and tools may return a non-string value. When this happens, `JSON.stringify(result)` is called, which for an object would produce `"{"key":"value"}"` — a JSON string of the object, not the actual text content. The result is never validated against any expected shape.

**Evidence**:
```typescript
// Line 116-124
const result = await chat({
  adapter: deps.adapter,
  systemPrompts: [SYSTEM_PROMPT],
  messages,
  tools: [...tools],
  stream: false,
});

const responseText = typeof result === "string" ? result : JSON.stringify(result);
```

When `chat` is called without `outputSchema` and with `stream: false`, TanStack AI runs `runNonStreamingText` → `streamToText()` which returns a string. So the `typeof result === "string"` branch is likely correct for this configuration. However, if the adapter or middleware returns something unexpected, the fallback `JSON.stringify` would produce a stringified version of the entire result object rather than extracting meaningful text content.

**Impact**: Low probability in practice since `stream: false` without `outputSchema` should always return a string. But the fallback is fragile — if the TanStack AI API evolves or an adapter returns a non-standard response, the persisted assistant message would contain garbage like `"{}"` instead of actual AI text.

**Suggestion**: Add a defensive check with a more explicit fallback:

```typescript
const result = await chat({ ... });
const responseText = typeof result === "string"
  ? result
  : typeof result === "object" && result !== null && "text" in result
    ? String((result as { text: string }).text)
    : String(result);
```

Or at minimum, log a warning when the non-string branch is hit so the issue is detectable in production.

---

### [SEVERITY: MEDIUM] Finding 3: Entity update failure in direct_write mode loses AI insight with no audit trail

**File**: `packages/ai/src/hook-executor.ts:296-312`  
**Problem**: In `direct_write` mode, if `entityUpdateFn` throws (e.g., validation error, DB constraint, network failure), the entire function propagates the error and the insight is never stored. The AI call was made (costing tokens/money), a response was received, but no record of this execution exists in the database. There is no audit trail of what the AI produced or attempted to apply.

**Evidence**:
```typescript
// Lines 296-312 — entity update happens BEFORE insight storage
if (input.writeBehavior === "direct_write" && fieldMappingResult.mappedCount > 0) {
  await deps.entityUpdateFn(  // If this throws, lines 316-339 never execute
    input.entityType!,
    input.entityId!,
    input.userId,
    fieldMappingResult.fields,
    { ... },
  );
  applied = true;
}

// Lines 316-339 — insight storage (unreachable if entityUpdateFn threw)
const insightId = randomUUID();
const insightRecord: AIInsightRecord = { ... };
await deps.insightStore.insert(insightRecord);
```

**Impact**: When a `direct_write` hook fails to apply fields (which will happen for data validation errors, stale entity state, etc.), the AI response is completely lost. There is no way to:
- Debug why the hook failed
- Recover the AI output for manual review
- Audit the cost (tokens used) of failed hook executions
- Retry the application with corrected data

**Suggestion**: Store the insight record before attempting the entity update, with `applied: false`. If the update succeeds, update the insight to `applied: true`. Alternatively, wrap the entity update in a try/catch and store the insight with error details:

```typescript
// Store insight first (always)
await deps.insightStore.insert({ ...insightRecord, applied: false });

// Then attempt entity update
if (input.writeBehavior === "direct_write" && fieldMappingResult.mappedCount > 0) {
  try {
    await deps.entityUpdateFn(...);
    // Update insight to mark as applied (or accept the insight is stored as not-applied)
    applied = true;
  } catch (updateError) {
    // Insight is already stored with applied: false — audit trail preserved
    throw updateError;
  }
}
```

---

## Files with No Real Issues

The following files were thoroughly reviewed and found to be well-implemented with no significant problems:

- **`packages/ai/src/index.ts`** — Clean barrel export, no issues.
- **`packages/ai/src/types.ts`** — Well-defined types and provider metadata. API keys correctly documented as memory-only.
- **`packages/ai/src/field-mapper.ts`** — Solid implementation with proper dot-notation resolution, overwrite protection, and unmapped field tracking.
- **`packages/ai/src/structured-output.ts`** — Clean utility functions for Zod schema conversion and validation.
- **`packages/ai/src/provider-manager.ts`** — Correct encryption/decryption flow, proper adapter factory delegation. `JSON.parse` in `decryptApiKey` throws naturally on malformed input (tested and expected).
- **`packages/ai/src/tools/index.ts`** — Well-defined CRM tools with proper schema definitions and server-side implementations. User scoping is correctly delegated to the data access layer.
- **`packages/ai/src/templates/index.ts`** — Clean template definitions with appropriate schemas and field mappings.
- **`packages/ai/src/adapters/*.ts`** — All four adapters (OpenAI, OpenRouter, Anthropic, Google) correctly pass API keys to their respective SDK constructors without logging or persisting them.
- **`packages/ai/__tests__/*.ts`** — Test files are well-structured with appropriate mocks and meaningful assertions.
