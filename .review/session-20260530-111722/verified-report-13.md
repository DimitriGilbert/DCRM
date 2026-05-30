# Verified Code Review Report — Cluster 13: `packages/i18n`

**Original Report**: `review-report-13.md`
**Verifier**: Verification Agent
**Date**: 2026-05-30

---

### Finding 1: Test corrupts shared translation dictionary with wrong restore keys — CONFIRMED

**Original**: The "restore" step at the end of the `registerTranslations` test uses incorrect keys that do not match the original dictionary, silently corrupting the module-level shared dictionary.

**Verification/Reason**: CONFIRMED by source code.

- `i18n.test.ts:110-113` contains:
  ```ts
  i18n.registerTranslations("en", {
    Save: "Save",
    Cancel: "Cancel",
  });
  ```
- The original `en.ts` dictionary uses dot-notation keys: `"common.save"`, `"common.cancel"`, `"common.edit"`, `"nav.dashboard"`, etc. (104 lines of translations).
- `i18n.ts:48` shows `registerTranslations` calls `dictionaries.set(locale, dict)` — this **replaces** the entire dictionary for that locale, it does not merge.
- After this test runs, the `"en"` dictionary becomes `{ Save: "Save", Cancel: "Cancel" }` — all ~50 original translations are lost.
- The `dictionaries` Map (`i18n.ts:8`) is module-scoped and persists across tests.
- The report correctly identifies that this is invisible today only because the `registerTranslations` describe block is the last one in the file. Any test added after it, or reordering, would expose the corruption.

**Severity upheld**: HIGH. The pollution is real, and the `dictionaries.set()` replaces (not merges) the entire dictionary.

---

### Finding 2: `createI18n` instance's `registerTranslations` mutates global shared state — CONFIRMED

**Original**: `createI18n` is documented as creating a "fresh, isolated i18n instance" but its `registerTranslations` method references the module-level shared function, mutating the global `dictionaries` Map.

**Verification/Reason**: CONFIRMED by source code.

- `i18n.ts:71-73` — JSDoc states: *"Create a fresh, isolated i18n instance"* and *"Useful for server-side per-request contexts."*
- `i18n.ts:96` — the `createI18n` return value includes: `registerTranslations,` — this is the module-scope function defined at line 42.
- `i18n.ts:42-49` — the function signature:
  ```ts
  function registerTranslations(locale: Locale, dict: TranslationDict): void {
    if (!SUPPORTED_LOCALES.includes(locale)) { throw new RangeError(...); }
    dictionaries.set(locale, dict);  // shared Map, not per-instance
  }
  ```
- `i18n.ts:8` — `dictionaries` is declared as `const dictionaries = new Map<Locale, TranslationDict>(...)` at module scope.
- The instance's `t` function (`instanceT` at line 77-81) correctly reads from the shared `dictionaries` via `getDict()`, so locale isolation works. But `registerTranslations` on the instance mutates global state — a caller has no way to know this.
- The singleton (`i18n` at line 103-110) also uses the same `registerTranslations` reference, which is appropriate for the singleton but misleading on the "isolated" instance.

**Severity upheld**: MEDIUM. The API is misleading — the "isolated" contract is violated. In server-side per-request contexts, calling `instance.registerTranslations()` would mutate dictionaries for all concurrent requests.

---

## Verification Summary

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Test corrupts shared translation dictionary with wrong restore keys | **CONFIRMED** |
| 2 | `createI18n`'s `registerTranslations` mutates global shared state | **CONFIRMED** |

**Confirmed: 2 / Dismissed: 0**
