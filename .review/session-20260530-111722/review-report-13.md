# Code Review Report — Cluster 13: `packages/i18n`

**Reviewer**: Code Reviewer - Cluster 13
**Date**: 2026-05-30
**Files Reviewed**:
1. `packages/i18n/src/index.ts`
2. `packages/i18n/src/i18n.ts`
3. `packages/i18n/src/types.ts`
4. `packages/i18n/src/locales/en.ts`
5. `packages/i18n/src/__tests__/i18n.test.ts`

**Scope**: Logic (interpolation, locale fallback), completeness

---

### [SEVERITY: HIGH] Finding 1: Test corrupts shared translation dictionary with wrong restore keys

**File**: `packages/i18n/src/__tests__/i18n.test.ts:110-113`
**Problem**: The "restore" step at the end of the `registerTranslations` test block uses incorrect keys that do not match the original dictionary. This silently corrupts the module-level shared dictionary for the rest of the process lifetime.

**Evidence**:
```ts
// Restore original
i18n.registerTranslations("en", {
  Save: "Save",      // ← wrong key, should be "common.save"
  Cancel: "Cancel",  // ← wrong key, should be "common.cancel"
});
```

The original English dictionary has keys `"common.save"`, `"common.cancel"`, `"common.edit"`, `"nav.dashboard"`, etc. (all dot-notation). The restore step registers a dictionary with bare keys `"Save"` and `"Cancel"` instead. After this test runs, the module-level `dictionaries` Map for `"en"` contains only `{ Save: "Save", Cancel: "Cancel" }` — the entire original English dictionary is wiped and replaced with two incorrect entries.

**Impact**:
- Any test or code that runs **after** this block in the same process (e.g. other test files, reordered tests, or new tests added later in this file) will get broken translations: `i18n.t("common.save")` will return `"common.save"` instead of `"Save"`.
- The `dictionaries` Map is module-scoped and persistent — there is no mechanism to reset it between test files.
- The bug is invisible today only because this test block happens to be the last one in the file. Any future reordering or addition will expose it.

**Suggestion**: Restore the actual original `en` dictionary instead of hand-typing incorrect keys:
```ts
import { en } from "../locales/en";

// ...at the end of the test:
// Restore original
i18n.registerTranslations("en", en);
```

Alternatively, use Vitest's `afterEach` / `afterAll` to ensure cleanup always happens.

---

### [SEVERITY: MEDIUM] Finding 2: `createI18n` instance's `registerTranslations` mutates global shared state, violating the "isolated" contract

**File**: `packages/i18n/src/i18n.ts:96`
**Problem**: `createI18n` is documented as creating a "fresh, isolated i18n instance" for "server-side per-request contexts." However, the returned object exposes `registerTranslations` which directly references the module-level `registerTranslations` function (line 42-49), mutating the shared `dictionaries` Map. The isolation only applies to the locale setting, not to translation dictionaries.

**Evidence**:
```ts
// Line 96 — inside createI18n return value:
registerTranslations,  // ← this is the module-scope function from line 42
```

```ts
// Line 42-49 — the module-scope function mutates shared Map:
function registerTranslations(locale: Locale, dict: TranslationDict): void {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new RangeError(...);
  }
  dictionaries.set(locale, dict);  // ← shared Map, not per-instance
}
```

**Impact**:
- In server-side per-request contexts (the stated use case), if one request calls `instance.registerTranslations(...)`, it mutates the dictionaries for ALL other concurrent requests — a race condition and data leak.
- Consumers may reasonably expect "isolated" means fully isolated, not "locale-isolated but dictionary-shared."
- The API surface is misleading — the method's presence on the instance implies instance-scoped behavior.

**Suggestion**: Either:
1. **Remove `registerTranslations` from the `createI18n` return value** since isolated instances should use pre-registered dictionaries, or
2. **Document the shared-dictionary behavior explicitly** in the JSDoc and on the interface, e.g.: *"Note: registerTranslations modifies the global shared dictionary, not a per-instance copy."*

Option 1 is safer for the server-side use case described in the doc comment:
```ts
return {
  get locale() { return instanceLocale; },
  t: instanceT,
  setLocale: (newLocale: Locale) => { ... },
  // registerTranslations intentionally omitted — isolated instances
  // should use globally registered dictionaries.
};
```

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 1     |
| MEDIUM   | 1     |
| **Total**| **2** |

**Overall assessment**: The i18n core implementation (`i18n.ts`, `types.ts`, `index.ts`, `locales/en.ts`) is clean, well-structured, and correct. The interpolation logic, fallback chain, and type definitions are sound. The two findings are: (1) a test pollution bug that silently corrupts shared state with wrong keys, and (2) a misleading API where `createI18n`'s "isolated" contract is violated by its `registerTranslations` method pointing to global state.
