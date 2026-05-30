# Verified Code Review Report — Cluster 35: Native App Core, Navigation & Tab Screens

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-35.md

---

## Verification Results

### Finding 1: Dashboard fires protected tRPC queries before auth check — unauthenticated API error storm

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `(tabs)/index.tsx:17-24`: Four `useQuery` hooks are called unconditionally:
  ```tsx
  const clients = useQuery(trpc.client.list.queryOptions({ limit: 1 }));
  const projects = useQuery(trpc.project.list.queryOptions({ limit: 1, status: "active" }));
  const tickets = useQuery(trpc.ticket.list.queryOptions({ limit: 1, status: "open" }));
  const exchanges = useQuery(trpc.exchange.list.queryOptions({ limit: 5 }));
  ```
- `(tabs)/index.tsx:26`: The auth gate `if (!session?.user)` comes AFTER the hooks.
- React hooks must be called unconditionally — they cannot be placed after early returns.
- The `protectedProcedure` middleware throws `UNAUTHORIZED` when `ctx.user` is null.

**Impact**: Confirmed. On every app launch while signed out, 4 unauthorized API requests fire, each returning an error. This happens on every render while unauthenticated. React Query caches these error states. The fix is to use `enabled: !!session?.user` in each query options.

---

### Finding 2: `signOut` race condition — queries may refetch with stale credentials

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `(tabs)/index.tsx:112-115`:
  ```tsx
  onPress={() => {
    authClient.signOut();         // async — cookie not yet cleared
    queryClient.invalidateQueries(); // synchronously marks stale, triggers refetch
  }}
  ```
- `authClient.signOut()` is async (returns a Promise) but is called without `await`.
- `queryClient.invalidateQueries()` runs synchronously immediately after, scheduling refetches before the session cookie is cleared.

**Impact**: Confirmed. There's a race window where refetched queries may use the old (still-valid) session cookie, briefly showing authenticated data to a user who just signed out. Then when signOut completes and clears the cookie, a second wave of refetches fires unauthenticated. This causes a confusing UI flicker: data → loading → sign-in form.

---

### Finding 3: Tab screens (clients, projects, tickets) make protected API calls with no auth guard and no error feedback

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `(tabs)/clients.tsx:12-14`: `useQuery(trpc.client.list.queryOptions({ limit: 50 }))` — no auth check, no `enabled` gate, no error handling.
- `(tabs)/projects.tsx:13-15`: Same pattern.
- `(tabs)/tickets.tsx:13-15`: Same pattern.
- None of these screens import or use `authClient.useSession()`.
- The `ListEmptyComponent` only handles loading and "no data" states (lines 33-43) — no error state.

**Impact**: Confirmed. When a user's session expires or they navigate to these tabs before signing in, the queries fail silently with `UNAUTHORIZED`. The user sees a loading spinner that resolves to "No clients yet" (or projects/tickets) with no indication that authentication is needed. Same server error noise as Finding 1.

---

### Finding 4: `ItemSeparatorComponent` receives inline arrow function — breaks FlatList recycling

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `(tabs)/clients.tsx:45`: `ItemSeparatorComponent={() => <View className="h-2" />}`
- `(tabs)/projects.tsx:46`: Same inline arrow function.
- `(tabs)/tickets.tsx:46`: Same inline arrow function.

**Impact**: Confirmed. Inline arrow functions create a new component reference on every render. React Native's FlatList uses referential equality comparison for `ItemSeparatorComponent` — a new reference forces unnecessary unmount/remount of all separators. With 50 items, this means 49 separator recreation cycles per render. The fix is straightforward: extract to a stable component reference defined outside the component body.

---

## Summary

| # | Verdict | Severity | File | Issue |
|---|---------|----------|------|-------|
| 1 | ✅ CONFIRMED | HIGH | `(tabs)/index.tsx` | Protected queries fire before auth check — error storm |
| 2 | ✅ CONFIRMED | MEDIUM | `(tabs)/index.tsx` | signOut race condition — stale credential refetch |
| 3 | ✅ CONFIRMED | MEDIUM | `(tabs)/clients.tsx`, `projects.tsx`, `tickets.tsx` | No auth guard, silent failure, no error UI |
| 4 | ✅ CONFIRMED | MEDIUM | `(tabs)/clients.tsx`, `projects.tsx`, `tickets.tsx` | Inline `ItemSeparatorComponent` breaks FlatList recycling |

**All 4 findings confirmed. 0 dismissed.**
