# Code Review Report — Clusters 34 & 35 (Native App)

**Reviewer**: Code Review Expert  
**Date**: 2026-05-30  
**Scope**: 24 files — Native screens (tabs, detail, create), shared components, auth, tRPC setup  
**Verdict**: 7 findings (1 HIGH, 5 MEDIUM, 1 LOW)

---

### [SEVERITY: HIGH] Finding 1: Dashboard Stat Cards Show Bogus Counts (always 0 or 1)

**File**: `apps/native/app/(tabs)/index.tsx:17-32, 67-82`  
**Problem**: The dashboard queries each entity with `limit: 1`, then uses `items.length` as the displayed count. Since the API returns `{ items, nextCursor }` and `limit: 1` caps the array at 1 element, every stat card will always display **0 or 1** — never the real count. Users with 200 clients see "1 Client" on their dashboard.

**Evidence**:
```tsx
// Lines 17-28 — queries capped at 1 item
const clients = useQuery({
  ...trpc.client.list.queryOptions({ limit: 1 }),
  enabled: !!session?.user,
});
const projects = useQuery({
  ...trpc.project.list.queryOptions({ limit: 1, status: "active" }),
  enabled: !!session?.user,
});
const tickets = useQuery({
  ...trpc.ticket.list.queryOptions({ limit: 1, status: "open" }),
  enabled: !!session?.user,
});

// Lines 67-82 — displays items.length as the stat value
<StatCard title="Clients" value={clients.data?.items.length ?? 0} ... />
<StatCard title="Active Projects" value={projects.data?.items.length ?? 0} ... />
<StatCard title="Open Tickets" value={tickets.data?.items.length ?? 0} ... />
```

**Impact**: The dashboard — the primary landing screen — is visually broken for any user with more than one record. This is the first thing users see after logging in.

**Suggestion**: The `list` API does not return a `total` field, so two options:
1. **Best**: Add a `count` procedure to each router (e.g., `trpc.client.count.query()`) that returns `{ total: number }` using `db.select({ count: sql\`count(*)\` })`.
2. **Quick fix**: Change `limit: 1` to a high number (e.g., `limit: 9999`) and use `items.length`. This is wasteful but correct for a single-user CRM scale.

---

### [SEVERITY: MEDIUM] Finding 2: Detail Pages Fire tRPC Queries With Empty-String ID

**File**: `apps/native/app/client/[id].tsx:14-16`, `apps/native/app/project/[id].tsx:15-17`, `apps/native/app/ticket/[id].tsx:15-17`, `apps/native/app/exchange/[id].tsx:12-14`  
**Problem**: All four detail screens call `useQuery(trpc.*.read.queryOptions({ id: id ?? "" }))` **before** the `if (!id)` early-return guard. Since React hooks must be called unconditionally, the query fires with `id: ""` whenever `id` is undefined/null. This makes an unnecessary network request that will fail on the server.

**Evidence**:
```tsx
// client/[id].tsx lines 14-16 — fires before the guard
const { data: client, isLoading } = useQuery(
  trpc.client.read.queryOptions({ id: id ?? "" }),
);

if (!id) {  // line 18 — too late, query already in flight
  return <Text>Client not found</Text>;
}
```

**Impact**: Wasted network request and potential brief error flash in the React Query cache. Not a data corruption risk, but is a pattern that will trip up future developers and pollutes server logs with 400s.

**Suggestion**: Add an `enabled` flag to each query:
```tsx
const { data: client, isLoading } = useQuery({
  ...trpc.client.read.queryOptions({ id: id ?? "" }),
  enabled: !!id,
});
```

---

### [SEVERITY: MEDIUM] Finding 3: DRY Violation — `getErrorMessage` Duplicated Verbatim

**File**: `apps/native/components/sign-in.tsx:24-49`, `apps/native/components/sign-up.tsx:25-50`  
**Problem**: The `getErrorMessage` helper function is copy-pasted identically in both sign-in and sign-up components (26 lines each). Per AGENTS.md code rules: "Single source of truth for types. Shared types go in dedicated type modules. Never redeclare across files."

**Evidence**: Both files contain the exact same 26-line function:
```tsx
function getErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (Array.isArray(error)) { /* ... */ }
  if (typeof error === "object" && error !== null) { /* ... */ }
  return null;
}
```

**Impact**: If the error extraction logic needs to change (e.g., handling nested Zod errors differently), it must be updated in two places. Easy to miss one.

**Suggestion**: Extract to a shared utility, e.g. `apps/native/utils/error.ts`:
```tsx
export function getErrorMessage(error: unknown): string | null { /* ... */ }
```

---

### [SEVERITY: MEDIUM] Finding 4: DRY Violation — `DetailRow` Component Duplicated

**File**: `apps/native/app/client/[id].tsx:141-162`, `apps/native/app/project/[id].tsx:156-176`  
**Problem**: The `DetailRow` component is defined separately in both detail screens with nearly identical logic (icon + label + value row). Per AGENTS.md: "Search for existing components before creating new ones."

**Evidence**:
```tsx
// client/[id].tsx — lines 141-162
function DetailRow({ icon, label, value, muted }: { ... }) {
  if (!value) return null;
  return (<View className="flex-row items-center py-1.5"> ... </View>);
}

// project/[id].tsx — lines 156-176
function DetailRow({ icon, label, value, muted }: { ... }) {
  return (<View className="flex-row items-center py-1"> ... </View>);
}
```

The client version returns `null` for falsy values; the project version always renders. This inconsistency suggests they were written independently without awareness of each other.

**Impact**: Divergent implementations of the same UI concept. Minor visual inconsistency (different padding: `py-1.5` vs `py-1`).

**Suggestion**: Extract to `apps/native/components/detail-row.tsx` with a single consistent implementation and an optional `hideIfEmpty` prop.

---

### [SEVERITY: MEDIUM] Finding 5: Create-Ticket Pre-Selection Broken for Non-Active Projects

**File**: `apps/native/app/create-ticket.tsx:27-29, 36-39, 93`  
**Problem**: When navigating from a project detail page via "New Ticket", the `projectId` is pre-set in state. However, the project list query filters by `status: "active"`. If the source project is not active (e.g., `completed`, `on_hold`, `archived`), it won't appear in the fetched list. The UI skips the picker (because `selectedProjectId` is set) but shows `"Change"` as the project name since `projects.find()` returns undefined.

**Evidence**:
```tsx
// Line 27-29 — pre-selects from params
const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
  params.projectId ?? null,
);

// Line 36-39 — only fetches active projects
const { data: projectsData } = useQuery(
  trpc.project.list.queryOptions({ limit: 100, status: "active" }),
);
const projects = projectsData?.items ?? [];

// Line 93 — fallback to "Change" when project not found
{projects.find((p) => p.id === selectedProjectId)?.name ?? "Change"}
```

**Impact**: User creates a ticket for a project they can't identify. Confusing UX — the form shows "Change" as the project label.

**Suggestion**: Either:
1. Remove the `status: "active"` filter so the pre-selected project is always found, or
2. Validate the pre-selected project exists in the fetched list and reset `selectedProjectId` to `null` if it doesn't, forcing the picker.

---

### [SEVERITY: MEDIUM] Finding 6: Unbounded `invalidateQueries()` After Every Mutation

**File**: `apps/native/app/(tabs)/index.tsx:122`, `apps/native/app/client/[id].tsx:46,59`, `apps/native/app/project/[id].tsx:47`, `apps/native/app/ticket/[id].tsx:47`, `apps/native/app/create-client.tsx:43`, `apps/native/app/create-project.tsx:41`, `apps/native/app/create-ticket.tsx:51`, `apps/native/app/create-exchange.tsx:56`  
**Problem**: Every mutation handler calls `queryClient.invalidateQueries()` with no arguments, which invalidates **every query in the cache**. Creating a client refetches all projects, tickets, exchanges, and dashboard stats. Deleting a ticket refetches client lists, project lists, etc.

**Evidence**:
```tsx
// Example from create-client.tsx:43
await trpcClient.client.create.mutate({ ... });
queryClient.invalidateQueries(); // invalidates EVERYTHING
```

**Impact**: Excessive network traffic. After creating a client, the app refetches 6+ unrelated queries. On slow connections this causes visible loading spinners across the entire app. Also risks race conditions with concurrent refetches.

**Suggestion**: Use targeted invalidation:
```tsx
// After creating a client
queryClient.invalidateQueries({ queryKey: ['client'] });

// After deleting a project
queryClient.invalidateQueries({ queryKey: ['project'] });
queryClient.invalidateQueries({ queryKey: ['ticket'] }); // tickets belong to projects
```
Alternatively, use the tRPC query key factory: `queryClient.invalidateQueries({ queryKey: trpc.client.list.queryKey() })`.

---

### [SEVERITY: LOW] Finding 7: Unused Import in Exchange Detail

**File**: `apps/native/app/exchange/[id].tsx:3`  
**Problem**: `useThemeColor` is imported from `heroui-native` but never called in the component. The variable `muted` that would come from it is not used anywhere in the rendered JSX.

**Evidence**:
```tsx
import { Spinner, Surface, useThemeColor } from "heroui-native"; // line 3
// useThemeColor is never called in the component body
```

**Impact**: Dead import. No runtime effect, but adds unnecessary bundle size and may confuse contributors who expect themed colors in this screen.

**Suggestion**: Remove `useThemeColor` from the import.

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | HIGH | `(tabs)/index.tsx` | Dashboard stats always show 0 or 1 due to `limit: 1` queries |
| 2 | MEDIUM | All 4 detail pages | Queries fire with empty-string ID before guard |
| 3 | MEDIUM | `sign-in.tsx`, `sign-up.tsx` | `getErrorMessage` helper duplicated verbatim (DRY) |
| 4 | MEDIUM | `client/[id].tsx`, `project/[id].tsx` | `DetailRow` component duplicated with subtle differences (DRY) |
| 5 | MEDIUM | `create-ticket.tsx` | Pre-selected non-active project shows confusing "Change" label |
| 6 | MEDIUM | 8 mutation handlers | `invalidateQueries()` with no filters refetches everything |
| 7 | LOW | `exchange/[id].tsx` | Unused `useThemeColor` import |

**Total findings: 7** (1 HIGH, 5 MEDIUM, 1 LOW)
