# Verified Code Review Report — Cluster 10: AI Engine Core

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: `review-report-10.md`

---

## Verification Summary

| # | Finding | Severity | Verdict | Reason |
|---|---------|----------|---------|--------|
| 1 | Wrong variable passed to `buildStructuredOutputConfig` | HIGH | ✅ CONFIRMED | `resolved` (full config object) is passed instead of `resolved.outputSchema`. Structured output is broken. |
| 2 | Chat result type handling may silently produce incorrect output | MEDIUM → LOW | ✅ CONFIRMED (downgraded) | The fallback is fragile but likely correct for current `stream: false` usage. |
| 3 | Entity update failure loses AI insight with no audit trail | MEDIUM | ✅ CONFIRMED | Entity update runs before insight storage; failed updates produce no DB record. |

---

## Finding 1: CONFIRMED — Wrong variable passed to `buildStructuredOutputConfig` — structured output is broken

**Severity**: HIGH (unchanged)

### Evidence Verified

**Source**: `packages/ai/src/hook-executor.ts`

1. **`resolved` is the full config object** — Line 196: `const resolved = resolveTemplateOverrides(input.config);`

   `resolveTemplateOverrides` (lines 137-156) returns:
   ```typescript
   return {
       systemPrompt: config.systemPrompt ?? template?.systemPrompt ?? "...",
       userPromptTemplate: config.userPromptTemplate ?? template?.userPromptTemplate ?? "...",
       outputSchema: config.outputSchema ?? (template ? template.outputSchema : undefined),
       fieldMapping: config.fieldMapping ?? template?.defaultFieldMapping ?? {},
   };
   ```
   This is `{ systemPrompt: string, userPromptTemplate: string, outputSchema: ZodSchema | Record | undefined, fieldMapping: Record }`.

2. **The wrong variable is passed** — Lines 246-249:
   ```typescript
   if (resolved.outputSchema) {
       const structuredConfig = buildStructuredOutputConfig(
           resolved as unknown as import("zod").ZodType<Record<string, unknown>>,
       );
   ```
   `resolved` (the entire config object) is passed, NOT `resolved.outputSchema` (the actual schema). The `as unknown as import("zod").ZodType<...>` cast masks the type error.

3. **`buildStructuredOutputConfig` processes the wrong input** — `packages/ai/src/structured-output.ts:42-52`:
   ```typescript
   export function buildStructuredOutputConfig<T>(
       schema: ZodType<T>,
       _description?: string,
   ): {
       schema: Record<string, unknown>;
       validate: (raw: unknown) => T;
   } {
       return {
           schema: zodToJsonSchema(schema),      // passes { systemPrompt, ... } to convertSchemaToJsonSchema
           validate: (raw: unknown) => validateStructuredOutput(raw, schema),  // calls (resolved).parse() — crash
       };
   }
   ```

4. **The `validate` function is broken** — `validateStructuredOutput` (line 17-22) calls `schema.parse(rawOutput)`. When `schema` is actually `resolved` (a plain object `{ systemPrompt, ... }`), calling `.parse()` will throw `TypeError: schema.parse is not a function` or similar.

5. **The `schema` property is garbage** — `zodToJsonSchema` calls `convertSchemaToJsonSchema(schema)` from TanStack AI. When `schema` is a plain object (not a Zod schema or Standard Schema), the result is undefined behavior — likely a passthrough or error.

6. **This affects ALL template-based hooks** — The four built-in templates (`summarize`, `classify`, `extract_contacts`, `enrich_from_web`) all have `outputSchema` defined (verified in `packages/ai/src/templates/index.ts:29-155`). Every hook using these templates will hit this code path.

7. **Tests pass because `chat` is mocked** — The report's explanation is consistent: if tests mock the `chat` function, the invalid schema is never sent to a real provider, so the bug isn't caught.

**Verdict**: The report is 100% accurate. This is a clear bug — the wrong variable is passed. Structured output is completely non-functional for all AI hooks. The suggested fix (pass `resolved.outputSchema` directly to `chat()`) is correct and simpler than the current intermediary approach.

---

## Finding 2: CONFIRMED (downgraded to LOW) — Chat result type handling is fragile

**Severity**: MEDIUM → **LOW** (downgraded)

### Evidence Verified

**Source**: `packages/ai/src/chat.ts:116-124`

```typescript
const result = await chat({
    adapter: deps.adapter,
    systemPrompts: [SYSTEM_PROMPT],
    messages,
    tools: [...tools],
    stream: false,
});

const responseText = typeof result === "string" ? result : JSON.stringify(result);
```

1. **The `typeof result === "string"` check is likely correct for this configuration**:
   - `stream: false` with tools — TanStack AI runs `runNonStreamingText` which returns a string.
   - The `chat` function with `stream: false` should always return a string in this configuration.

2. **The `JSON.stringify` fallback is defensive** — If the result is somehow not a string (adapter bug, API change), `JSON.stringify` produces at least a string value. It won't crash. The result may be garbage like `"{}"`, but it won't cause an unhandled error.

3. **Low practical risk**: The report itself acknowledges "Low probability in practice." The `stream: false` path in TanStack AI reliably returns strings.

**Verdict**: The finding is technically correct — the fallback is fragile. However, for the current configuration, the code works as intended. Downgrading to LOW because this is a defensive coding improvement, not a functional bug. Adding a log warning in the fallback branch is a reasonable improvement.

---

## Finding 3: CONFIRMED — Entity update failure in `direct_write` mode loses AI insight

**Severity**: MEDIUM (unchanged)

### Evidence Verified

**Source**: `packages/ai/src/hook-executor.ts`

1. **Entity update runs BEFORE insight storage** — Lines 296-312:
   ```typescript
   if (input.writeBehavior === "direct_write" && fieldMappingResult.mappedCount > 0) {
       await deps.entityUpdateFn(   // ← Can throw → lines 316-339 unreachable
           input.entityType!,
           input.entityId!,
           input.userId,
           fieldMappingResult.fields,
           { hookExecutionId: input.executionId, eventId: input.eventId, emitDownstreamEvents: input.emitDownstreamEvents },
       );
       applied = true;
   }
   ```

2. **Insight storage is AFTER entity update** — Lines 316-339:
   ```typescript
   // 8. Store insight
   const insightId = randomUUID();
   const insightRecord: AIInsightRecord = { ... };
   await deps.insightStore.insert(insightRecord);   // ← Unreachable if entityUpdateFn threw
   ```

3. **The AI call has already been made** — By the time we reach line 296, the AI provider has been called (line 252), tokens have been consumed, and a structured output has been generated. If `entityUpdateFn` throws, all of this is lost.

4. **No try-catch around the entity update** — The code at lines 296-312 has no try-catch. Any error from `entityUpdateFn` (validation error, DB constraint, network failure) propagates and skips insight storage.

**Verdict**: The report is accurate. This is a real data loss issue — AI responses are discarded without trace when entity updates fail. The suggested fix (store insight first with `applied: false`, then attempt update) is correct and straightforward to implement. This also provides audit trail for debugging and cost tracking.

---

## Items Verified as Clean

- **`packages/ai/src/field-mapper.ts`**: Solid implementation with proper dot-notation resolution, overwrite protection via `existingFields` check (line 83), and unmapped field tracking.
- **`packages/ai/src/structured-output.ts`**: The utility functions (`zodToJsonSchema`, `validateStructuredOutput`, `safeValidateStructuredOutput`) are correctly implemented — the bug is in how they're called, not in their implementation.
- **`packages/ai/src/provider-manager.ts`**: Encryption/decryption flow for API keys is correct.
- **`packages/ai/src/tools/index.ts`**: Tool definitions are well-structured with proper schema definitions.
- **`packages/ai/src/templates/index.ts`**: Template schemas are valid Zod v4 schemas with appropriate field definitions.
- **`packages/ai/src/index.ts`**: Clean barrel export, no issues.
