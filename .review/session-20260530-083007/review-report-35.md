# Review Report — Cluster 35: Native App Core, Navigation & Tab Screens

**Reviewer**: Code Review Agent
**Date**: 2026-05-30
**Files Reviewed**: 12 files in `apps/native/`

---

### [SEVERITY: HIGH] Finding 1: Dashboard fires protected tRPC queries before auth check — unauthenticated API error storm

**File**: `apps/native/app/(tabs)/index.tsx:17-24`
**Problem**: The dashboard component invokes four `useQuery` hooks (lines 17–24) that call `protectedProcedure` endpoints *before* the session check on line 26. In React, hooks execute unconditionally on every render — the early return on line 26 (`if (!session?.user)`) happens too late. When no user is authenticated, all four queries fire with no/invalid credentials, hit the server, and each one throws a `TRPCError { code: "UNAUTHORIZED" }`. This happens on every app launch and every re-render while unauthenticated.

**Evidence**:
```tsx
// Lines 17–24: These execute on EVERY render, before the auth gate
const clients = useQuery(trpc.client.list.queryOptions({ limit: 1 }));
const projects = useQuery(trpc.project.list.queryOptions({ limit: 1, status: "active" }));
const tickets = useQuery(trpc.ticket.list.queryOptions({ limit: 1, status: "open" }));
const exchanges = useQuery(trpc.exchange.list.queryOptions({ limit: 5 }));

if (!session?.user) {
  return ( /* sign-in/sign-up UI */ );
}
```

The API `protectedProcedure` middleware (`packages/api/src/index.ts:11-17`) throws `UNAUTHORIZED` when `ctx.user` is null.

**Impact**:
- 4 failed HTTP requests on every app launch while signed out, multiplied by every re-render.
- Server-side error noise — every unauthenticated app launch logs 4 auth failures.
- React Query caches error states for these queries, which can surface as stale error UI when the user does sign in (queries need to refetch to clear the error state).
- On slow networks, these failing requests compete with the actual sign-in request for bandwidth.

**Suggestion**: Gate queries behind authentication using `enabled`:
```tsx
const clients = useQuery({
  ...trpc.client.list.queryOptions({ limit: 1 }),
  enabled: !!session?.user,
});
```
Repeat for all four queries. This prevents any network request until a session is confirmed.

---

### [SEVERITY: MEDIUM] Finding 2: `signOut` race condition — queries may refetch with stale credentials

**File**: `apps/native/app/(tabs)/index.tsx:112-115`
**Problem**: `authClient.signOut()` is called without `await`, and `queryClient.invalidateQueries()` runs synchronously immediately after. The invalidation schedules refetches that execute before `signOut` has cleared the session cookie from SecureStore. The tRPC `headers()` function reads the cookie from `authClient.getCookie()` on each request, so the refetched queries carry the old (still-valid) session cookie.

**Evidence**:
```tsx
onPress={() => {
  authClient.signOut();         // async — cookie not yet cleared
  queryClient.invalidateQueries(); // synchronously marks stale, triggers refetch
}}
```

**Impact**:
- Brief window where refetched queries succeed with the old session, showing authenticated data to a user who just signed out.
- If signOut then completes and clears the cookie, a second wave of refetches (triggered by the session state change) fires unauthenticated — causing the error storm described in Finding 1.
- The user sees a confusing flicker: dashboard data → loading → empty/sign-in form.

**Suggestion**:
```tsx
onPress={async () => {
  await authClient.signOut();
  queryClient.invalidateQueries();
}}
```
Awaiting signOut ensures the cookie is cleared before any queries are invalidated.

---

### [SEVERITY: MEDIUM] Finding 3: Tab screens (clients, projects, tickets) make protected API calls with no auth guard and no error feedback

**File**: `apps/native/app/(tabs)/clients.tsx:12-14`, `apps/native/app/(tabs)/projects.tsx:13-15`, `apps/native/app/(tabs)/tickets.tsx:13-15`
**Problem**: All three tab screens immediately fire `useQuery` with `protectedProcedure` endpoints and have zero authentication checks. If a user taps these tabs while unauthenticated (e.g., session expired, or navigating before signing in), the queries fail with `UNAUTHORIZED` errors silently — there is no error handling or UI feedback for the auth failure. The user sees a loading spinner that resolves to an empty state with no explanation of why.

**Evidence** (clients.tsx, identical pattern in projects.tsx and tickets.tsx):
```tsx
const { data, isLoading } = useQuery(
  trpc.client.list.queryOptions({ limit: 50 }),
);
// ... no auth check, no error handling, no error UI
// ListEmptyComponent only handles loading and "no data" states
```

**Impact**:
- Silent auth failures — user sees "No clients yet" instead of "Sign in to view clients" or a redirect to the auth screen.
- Can be triggered if the session expires while the user is on another tab, then they switch back.
- Same unnecessary server error noise as Finding 1.

**Suggestion**: Either add auth gating at the tab layout level (redirect to index), or add per-screen auth checks with `enabled` and error feedback:
```tsx
// Option A: Gate at (tabs)/_layout.tsx
const { data: session } = authClient.useSession();
if (!session?.user) return <Redirect href="/" />;

// Option B: Per-screen
const { data, isLoading, error } = useQuery({
  ...trpc.client.list.queryOptions({ limit: 50 }),
  enabled: !!session?.user,
});
```

---

### [SEVERITY: MEDIUM] Finding 4: `ItemSeparatorComponent` receives inline arrow function — breaks FlatList recycling

**File**: `apps/native/app/(tabs)/clients.tsx:46`, `apps/native/app/(tabs)/projects.tsx:46`, `apps/native/app/(tabs)/tickets.tsx:46`
**Problem**: `ItemSeparatorComponent={() => <View ... />}` creates a new component reference on every render. React Native's FlatList uses referential equality to determine if `ItemSeparatorComponent` changed — a new reference each render forces the list to tear down and recreate every separator on each render cycle. With 50 items, this means 49 unnecessary unmount/remount cycles per render.

**Evidence**:
```tsx
ItemSeparatorComponent={() => <View className="h-2" />}
```

**Impact**:
- Degrades scroll performance on lists with many items, especially noticeable on lower-end devices.
- Prevents FlatList from optimizing separator rendering.
- The issue is replicated across all three tab screens.

**Suggestion**: Extract to a stable component reference:
```tsx
const ItemSeparator = () => <View className="h-2" />;
// Then:
<FlatList ItemSeparatorComponent={ItemSeparator} ... />
```
Define `ItemSeparator` outside the component body or use `useMemo`/`useCallback` to stabilize the reference.

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | HIGH | `(tabs)/index.tsx` | Protected queries fire before auth check — error storm on every unauthenticated launch |
| 2 | MEDIUM | `(tabs)/index.tsx` | signOut race condition — stale credential refetch |
| 3 | MEDIUM | `(tabs)/clients.tsx`, `projects.tsx`, `tickets.tsx` | No auth guard, silent failure, no error UI |
| 4 | MEDIUM | `(tabs)/clients.tsx`, `projects.tsx`, `tickets.tsx` | Inline `ItemSeparatorComponent` breaks FlatList recycling |

**No security vulnerabilities found.** The cookie handling in `utils/trpc.ts` and `lib/auth-client.ts` correctly uses SecureStore on native and manual cookie forwarding with `credentials: "omit"` — this is the standard Better Auth Expo pattern. The server-side `protectedProcedure` middleware properly blocks unauthenticated access. The issues are all on the client side around *when* and *how* queries are triggered, not *whether* the server enforces auth.
