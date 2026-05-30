# Code Review Report — Cluster 30: Shared Components

**Reviewer**: Code Review Expert (Cluster 30)
**Date**: 2026-05-30
**Files Reviewed**:
1. `apps/web/src/components/header.tsx`
2. `apps/web/src/components/user-menu.tsx`
3. `apps/web/src/components/loader.tsx`
4. `apps/web/src/components/sign-in-form.tsx`
5. `apps/web/src/components/sign-up-form.tsx`
6. `apps/web/src/components/notification-bell.tsx`
7. `apps/web/src/components/global-search.tsx`
8. `apps/web/src/components/exchange-timeline.tsx`

---

## Summary

The shared components are generally well-structured and use React's built-in XSS protection correctly (all user-generated content is rendered as text children in JSX, never via `dangerouslySetInnerHTML`). The tRPC query hooks are used correctly with proper `queryOptions` patterns. Auth state flows through Better Auth's `useSession()` hook consistently.

Three real issues were found — all MEDIUM severity — centered on error state handling gaps and one SPA navigation violation.

---

### [SEVERITY: MEDIUM] Finding 1: Error state silently masked as empty data in ExchangeTimeline

**File**: `apps/web/src/components/exchange-timeline.tsx:57-67`
**Problem**: When the tRPC query fails (`timelineQuery.isError === true`), the component falls through to `timelineQuery.data ?? []` which evaluates to `[]`, and then renders "No activity recorded yet." The user sees a "no data" message when the real problem is a network or server error. There is zero feedback that something went wrong.

**Evidence**:
```tsx
// Line 57-75: isLoading is checked, but isError is never checked
if (timelineQuery.isLoading) {
  return (
    <div className="space-y-3 py-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

const items = timelineQuery.data ?? [];
// ↑ When isError is true, data is undefined, items becomes [], shows "No activity"

if (items.length === 0) {
  return (
    <p className="py-8 text-center text-xs text-muted-foreground">
      No activity recorded yet.
    </p>
  );
}
```

**Impact**: Users cannot distinguish between "no exchanges exist" and "the API is down or returned an error." This leads to confusion and missed troubleshooting — especially in a CRM where exchange history is critical context for client interactions.

**Suggestion**: Add an explicit error state check before the empty-data check:
```tsx
if (timelineQuery.isError) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-xs text-destructive">Failed to load activity.</p>
      <Button variant="ghost" size="sm" onClick={() => timelineQuery.refetch()}>
        Retry
      </Button>
    </div>
  );
}
```

---

### [SEVERITY: MEDIUM] Finding 2: Full page reload bypasses TanStack Router in GlobalSearch

**File**: `apps/web/src/components/global-search.tsx:82`
**Problem**: When a search result is selected, navigation is performed via `window.location.href = routeBuilder(entityId)`, which triggers a full browser page reload. This completely bypasses TanStack Router's client-side navigation, destroying all in-memory React state, React Query cache, and causing a visible white-flash reload. The comment acknowledges this is a workaround for strict typing issues.

**Evidence**:
```tsx
// Line 75-85
const handleSelect = useCallback(
  (entityType: string, entityId: string) => {
    const routeBuilder = ENTITY_ROUTES[entityType];
    if (!routeBuilder) return;
    onOpenChange(false);
    // Use href-based navigation to avoid TanStack Router strict typing issues
    // with dynamic entity types
    window.location.href = routeBuilder(entityId);
  },
  [onOpenChange],
);
```

**Impact**: Every search-result click causes a full page reload, which:
- Loses all React Query cache state, causing every other tRPC query on the target page to re-fetch from scratch.
- Loses any unsaved form state the user may have had on the current page.
- Creates a jarring UX inconsistent with every other navigation in the app (sidebar links, etc. all use `<Link>`).
- The `ENTITY_ROUTES` map for `ticket` and `exchange` ignores the `entityId` parameter entirely (`() => "/tickets"`, `() => "/clients"`), meaning individual ticket/exchange results always navigate to a list page, not the specific item. This is a separate data-integrity concern in the route mapping.

**Suggestion**: Use TanStack Router's `useNavigate` with a type-safe approach, or use `router.navigate` from `useRouter()`:
```tsx
import { useNavigate } from "@tanstack/react-router";

// Inside the component:
const navigate = useNavigate();

const handleSelect = useCallback(
  async (entityType: string, entityId: string) => {
    const routeBuilder = ENTITY_ROUTES[entityType];
    if (!routeBuilder) return;
    onOpenChange(false);
    // Use router.navigate to preserve SPA behavior
    await navigate({ to: routeBuilder(entityId) as "/clients/$clientId" });
  },
  [onOpenChange, navigate],
);
```
Alternatively, if the strict typing issue is hard to resolve with dynamic entity types, use `router.history.push(routeBuilder(entityId))` which does a client-side push without a full reload.

---

### [SEVERITY: MEDIUM] Finding 3: Error state silently masked as "no results" in GlobalSearch

**File**: `apps/web/src/components/global-search.tsx:113-127`
**Problem**: When the search query fails (`searchQuery.isError === true`), the rendering logic falls through to the `else` branch, which shows `CommandEmpty` with "No results found for \{query\}". The user is told there are no results when the query actually errored.

**Evidence**:
```tsx
// Line 113-127
{query.length === 0 ? (
  <CommandEmpty>
    Start typing to search...
  </CommandEmpty>
) : searchQuery.isLoading ? (
  <div className="space-y-2 p-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} className="h-10 w-full" />
    ))}
  </div>
) : (
  // ↑ When isError is true AND isLoading is false, we land here
  <>
    <CommandEmpty>
      No results found for &ldquo;{query}&rdquo;
    </CommandEmpty>
    {/* groupedResults would be {} from the ternary on line 88 */}
  </>
)}
```

**Impact**: If the search API is unreachable or returns an error, the user sees "No results found" — they might believe their clients/leads/projects don't exist rather than recognizing a connectivity issue. In a CRM context, this could lead to users creating duplicate records thinking data is missing.

**Suggestion**: Add an error branch in the conditional rendering:
```tsx
) : searchQuery.isError ? (
  <div className="p-4 text-center text-sm text-destructive">
    Search failed. Please try again.
  </div>
) : (
```

---

## Non-Issues (Verified Safe)

- **XSS Prevention**: All components render user-generated content (`session.user.name`, `session.user.email`, `n.title`, `n.message`, `item.subject`, `item.body`, `item.label`) as text children in JSX. React auto-escapes these. No `dangerouslySetInnerHTML` usage found. **No XSS vulnerability.**

- **tRPC Query Hooks**: Both `exchange-timeline.tsx` and `global-search.tsx` correctly use `trpc.exchange.timeline.queryOptions()` and `trpc.search.global.queryOptions()` with proper `enabled` guards and input schemas matching the server-side Zod schemas. **No API contract violations.**

- **Auth State Management**: `user-menu.tsx`, `sign-in-form.tsx`, and `sign-up-form.tsx` all correctly use `authClient.useSession()` and handle the `isPending` state. The `_authenticated.tsx` layout properly guards with `beforeLoad` redirect. **No auth state bugs.**

- **Data Scoping**: All server-side procedures correctly scope by `ctx.user.id`. The client-side components pass correct input parameters. **No data leakage.**

- **NotificationBell**: Pure presentational component receiving data via props with no direct API calls. Callbacks (`onMarkRead`, `onMarkAllRead`) are delegated to the parent. **No issues.**

- **Loader**: Pure presentational. **No issues.**

- **Header**: Simple static navigation. **No issues.**

---

## Files with No Real Issues

| File | Verdict |
|------|---------|
| `header.tsx` | Clean |
| `user-menu.tsx` | Clean |
| `loader.tsx` | Clean |
| `sign-in-form.tsx` | Clean |
| `sign-up-form.tsx` | Clean |
| `notification-bell.tsx` | Clean |
