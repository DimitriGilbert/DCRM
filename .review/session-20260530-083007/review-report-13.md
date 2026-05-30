# Code Review Report — Cluster 13: i18n Package

**Reviewer**: Code Review Expert  
**Files Reviewed**:
1. `packages/i18n/src/types.ts`
2. `packages/i18n/src/i18n.ts`
3. `packages/i18n/src/index.ts`
4. `packages/i18n/src/locales/en.ts`
5. `packages/i18n/src/__tests__/i18n.test.ts`

**Scope**: Locale fallback behavior, interpolation safety (XSS), key collision handling.

---

## Summary

The i18n package is well-structured and cleanly implemented. The type system is sound — `SUPPORTED_LOCALES` as a const tuple, `Locale` derived from it, and `TranslationDict` as `Readonly<Record<string, string>>` are all correct. The fallback chain in `getDict()` is robust (requested locale → default locale → direct import). Key collision is handled naturally by `Map.set` semantics (last write wins), which is the expected behavior for a `registerTranslations` API.

One real issue found.

---

### [SEVERITY: MEDIUM] Finding 1: Double Interpolation — Param Values Are Re-Interpolated as Placeholders

**File**: `packages/i18n/src/i18n.ts:25-31`
**Problem**: The `interpolate` function iterates `Object.entries(params)` and does sequential `replaceAll` calls on the same result string. A param **value** that contains `{anotherKey}` syntax will be re-interpolated by a subsequent iteration if `anotherKey` is also present in `params`. This is a logic error — param values should be treated as literal data, not as templates.

**Evidence**:
```ts
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}
```

**Concrete scenario in this CRM**: Imagine a translation like:
```ts
"clients.welcome": "Welcome {name}, your plan is {plan}"
```
Called with user-provided data:
```ts
t("clients.welcome", { name: clientName, plan: "Pro" })
```
If `clientName` is literally the string `"{plan}"`, the iteration produces:
1. Replace `{name}` with `{plan}` → `"Welcome {plan}, your plan is {plan}"`
2. Replace `{plan}` with `Pro` → `"Welcome Pro, your plan is Pro"`

The user's name is silently replaced. The output is wrong — it should be `Welcome {plan}, your plan is Pro`.

**Impact**: Silent data corruption in translated strings when user-provided values (client names, company names, notes) happen to contain `{...}` patterns matching other param keys. In a CRM where users manage freeform data (notes, company names, lead descriptions), this is not purely theoretical.

**Suggestion**: Replace all placeholders in a single pass rather than iteratively. A `replace` with a regex and a lookup function avoids re-interpolation:

```ts
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in params ? String(params[key]) : match;
  });
}
```

This replaces each `{key}` exactly once by matching directly against the original template, never against previously substituted values. The regex `\{(\w+)\}` also restricts placeholder keys to word characters, which is more predictable than accepting arbitrary strings.

---
