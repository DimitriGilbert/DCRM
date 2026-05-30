# Verified Report — Cluster 13: i18n Package

**Original Report**: `review-report-13.md`
**Verdict**: 1 finding — **CONFIRMED**.

---

## Verification Method

Read all source files:
- `packages/i18n/src/i18n.ts` (114 lines, full file)
- `packages/i18n/src/types.ts` (verified `SUPPORTED_LOCALES`, `Locale`, `TranslationDict`)
- `packages/i18n/src/locales/en.ts` (default translation dictionary)
- `packages/i18n/src/__tests__/i18n.test.ts` (115 lines, test coverage)

---

### Finding 1: Double Interpolation — ✅ CONFIRMED

**Severity**: MEDIUM (unchanged)

**Evidence verified**:

`i18n.ts:25-31` — The `interpolate` function:
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

The function iterates `Object.entries(params)` sequentially, applying `replaceAll` on the same mutable `result` string. Each iteration operates on the output of the previous iteration — not on the original template.

**Scenario reproduction from the report is valid**:

Given template `"Welcome {name}, your plan is {plan}"` and params `{ name: "{plan}", plan: "Pro" }`:

1. Iteration 1 (key=`"name"`, value=`"{plan}"`): `result.replaceAll("{name}", "{plan}")` → `"Welcome {plan}, your plan is {plan}"`
2. Iteration 2 (key=`"plan"`, value=`"Pro"`): `result.replaceAll("{plan}", "Pro")` → `"Welcome Pro, your plan is Pro"`

Expected output: `"Welcome {plan}, your plan is Pro"` — the user's name should be the literal string `{plan}`.

**However, practical impact assessment**:

The test file confirms that the current usage is simple numeric interpolation:
```ts
// i18n.test.ts:36
expect(i18n.t("onboarding.step", { current: 1, total: 3 })).toBe("Step 1 of 3");
```

In the current codebase, interpolation parameters are primarily numbers and simple strings from the app's own translation dictionaries (not user-provided freeform data). The `en.ts` locale file uses patterns like `{current}`, `{total}` — not user-controlled values.

That said, the report correctly identifies this as a structural logic error. If `t()` is ever called with user-provided string values (client names, company names, notes) that happen to contain `{anotherKey}` syntax, silent data corruption will occur. The fix (single-pass regex replacement) is simple and correct.

**Verdict**: CONFIRMED. The double-interpolation bug is real. The code does exactly what the report describes. Practical impact is currently low because interpolation parameters are mostly numeric, but it's a correctness defect that should be fixed.

**Suggested fix from original report is correct**:
```ts
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in params ? String(params[key]) : match;
  });
}
```

---

## Summary

| Finding | Original Severity | Verdict | Notes |
|---------|------------------|---------|-------|
| F1: Double interpolation | MEDIUM | ✅ CONFIRMED | Real logic error — sequential `replaceAll` allows re-interpolation. Low practical impact today but structurally wrong. |

Zero false positives in the original report. The "clean" assessment of the rest of the package (type system, fallback chain, `registerTranslations` Map semantics) is also confirmed correct.
