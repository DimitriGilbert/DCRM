# Verified Report — Cluster 30: Shared Components

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Source**: review-report-30.md
**Result**: 3 CONFIRMED / 0 DISMISSED

---

## Finding 1: Error state silently masked as empty data in ExchangeTimeline

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `exchange-timeline.tsx` lines 57–65: Checks `timelineQuery.isLoading` — shows skeleton.
- Line 67: `const items = timelineQuery.data ?? [];` — when `isError` is true, `data` is `undefined`, so `items` becomes `[]`.
- Lines 69–75: `items.length === 0` renders "No activity recorded yet."
- No `isError` check exists anywhere in the component.

**Execution flow when query fails**: `isLoading` is false → skip skeleton → `data` is `undefined` → `items` is `[]` → "No activity recorded yet."

The user sees a "no data" message when the real problem is a server error or network failure. There is zero feedback that something went wrong.

---

## Finding 2: Full page reload bypasses TanStack Router in GlobalSearch

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `global-search.tsx` line 82: `window.location.href = routeBuilder(entityId)` — triggers full browser reload.
- Comment on lines 80–81 explicitly acknowledges: `// Use href-based navigation to avoid TanStack Router strict typing issues with dynamic entity types`.
- Every sidebar link and other navigation in the app uses TanStack Router's `<Link>` component or `useNavigate()` — this is the only place that does a full reload.

**Additional issue verified**: Lines 23–29 define `ENTITY_ROUTES`:
```ts
ticket: () => "/tickets",
exchange: () => "/clients",
```
Both `ticket` and `exchange` route builders **ignore the `entityId` parameter entirely**. Clicking a ticket search result navigates to `/tickets` (list page), not to the specific ticket. Clicking an exchange result navigates to `/clients`. This is a separate UX bug in the route mapping.

**Impact**: 
1. Every search result click causes a full page reload, destroying React Query cache and any unsaved form state.
2. Ticket and exchange results navigate to wrong pages (list pages instead of detail pages).

---

## Finding 3: Error state silently masked as "no results" in GlobalSearch

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `global-search.tsx` lines 113–162: The ternary renders:
  - `query.length === 0` → "Start typing to search..."
  - `searchQuery.isLoading` → skeleton loaders
  - `else` → shows results or "No results found"
- There is no `searchQuery.isError` branch.

When the query errors:
- `query.length > 0` → skip first branch
- `isLoading` is false → skip skeleton
- Falls to `else` branch → `groupedResults` is `{}` (because `searchQuery.data` is `undefined`) → `CommandEmpty` shows "No results found for {query}"

The user is told there are no matching records when the API actually failed. In a CRM context, this could lead to users creating duplicate records thinking data is missing.

---

## Non-Issues Verified

The report's "Non-Issues" section was spot-checked:

- **XSS Prevention**: All user-generated content rendered as JSX text children. No `dangerouslySetInnerHTML` found. ✅
- **tRPC Query Hooks**: Both components correctly use `trpc.*.queryOptions()` with proper `enabled` guards. ✅
- **Auth State Management**: `user-menu.tsx`, `sign-in-form.tsx`, `sign-up-form.tsx` all correctly use `authClient.useSession()`. ✅
- **NotificationBell**: Pure presentational, no API calls. ✅
- **Loader**: Pure presentational. ✅
- **Header**: Simple static navigation. ✅

---

## Summary

| # | Finding | Verdict | Severity |
|---|---------|---------|----------|
| 1 | Error masked as empty data in ExchangeTimeline | CONFIRMED | MEDIUM |
| 2 | Full page reload in GlobalSearch | CONFIRMED | MEDIUM |
| 3 | Error masked as no results in GlobalSearch | CONFIRMED | MEDIUM |

**False positives**: 0
