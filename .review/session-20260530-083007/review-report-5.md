# Review Report — Cluster 5: Domain Types (Supporting Modules)

**Reviewer**: Code Review Expert — Cluster 5
**Date**: 2026-05-30
**Scope**: `packages/domain/src/{billing,attachment,webhook,custom-field,ai}.ts` + corresponding `__tests__/`

## Summary

**No real issues found.** All 5 source files and 5 test files are clean, consistent, and correct.

## Detailed Analysis

### Source Files Reviewed

| File | Lines | Purpose | Verdict |
|------|-------|---------|---------|
| `packages/domain/src/billing.ts` | 24 | 5 billing statuses + Zod schema | Clean |
| `packages/domain/src/attachment.ts` | 24 | 5 attachment entity types + Zod schema | Clean |
| `packages/domain/src/webhook.ts` | 43 | 4 outgoing auth modes + 2 incoming modes + Zod schemas | Clean |
| `packages/domain/src/custom-field.ts` | 28 | 7 custom field types + Zod schema | Clean |
| `packages/domain/src/ai.ts` | 22 | 4 AI providers + Zod schema | Clean |

### Test Files Reviewed

| File | Lines | Verdict |
|------|-------|---------|
| `packages/domain/__tests__/billing.test.ts` | 29 | Clean |
| `packages/domain/__tests__/attachment.test.ts` | 29 | Clean |
| `packages/domain/__tests__/webhook.test.ts` | 53 | Clean |
| `packages/domain/__tests__/custom-field.test.ts` | 45 | Clean |
| `packages/domain/__tests__/ai.test.ts` | 39 | Clean |

### What I Verified

1. **Schema correctness** — Every `z.enum()` array contains exactly the values from the corresponding `as const` object. Zod 4 (`^4.4.3` from catalog) `z.enum()` accepts these string literal tuples correctly.

2. **Type derivation chain** — Each module follows the same pattern: `as const` object -> `Keyof typeof` for keys -> `typeof obj[Key]` for values -> `Object.values()` for runtime array -> `z.enum()` for validation schema. The type derivation is sound.

3. **Downstream consumers** — Verified all 21 import sites across `packages/db`, `packages/api`, `packages/webhooks`, `packages/billing`, and `packages/ai`. The domain types are consumed correctly:
   - `*_VALUES` arrays feed `pgEnum()` in Drizzle schema definitions
   - `*Schema` Zod schemas validate API inputs in tRPC router schemas
   - Type imports are used with `import type` as required by `verbatimModuleSyntax`
   - Webhook auth modes power exhaustive `switch` statements in `packages/webhooks/src/auth.ts` with proper `never` fallback

4. **Enum exhaustiveness** — The downstream `resolveAuthHeaders()` function in `packages/webhooks/src/auth.ts` handles all 4 outgoing auth modes from the domain type plus a `"none"` mode, with a `default: { const _: never = auth }` exhaustiveness check. This confirms the enum values are complete for their use case.

5. **Index re-exports** — All 5 modules are properly re-exported from `packages/domain/src/index.ts` with both value exports and `export type` for type-only exports, complying with `verbatimModuleSyntax`.

6. **Test coverage** — Each test file validates the three critical properties: (a) const object has expected values, (b) schema accepts all valid values, (c) schema rejects invalid values. Additional tests for `*_VALUES` arrays exist where relevant. Tests use dynamic `await import()` which is fine for unit tests.

### Non-Issues Considered and Dismissed

- **DRY concern (const object + z.enum duplication)**: The `z.enum()` arrays manually enumerate the same values from the const object. This is an intentional design choice — it makes each enum value's inclusion in the schema explicit and auditable. TypeScript downstream will catch mismatches when schema output types are compared against domain types.

- **No `CUSTOM_FIELD_TYPE_VALUES` / `AI_PROVIDER_VALUES` tests in some files**: Minor test completeness difference between test files; not a bug or real issue.

- **Zod 4 compatibility**: Confirmed `z.enum()` API accepts string literal tuples identically in Zod 4.

## Conclusion

These are well-structured, pure definition modules with no runtime logic, no I/O, no state, and no side effects. The pattern is consistent across all 5 files. No security vulnerabilities, logic errors, data integrity issues, or state management bugs exist.
