# Verified Code Review Report — Cluster 34

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-34.md (Clusters 34 & 35 — Native App)

---

### Finding 1: Dashboard Stat Cards Show Bogus Counts (always 0 or 1) — CONFIRMED

**Original**: Dashboard queries each entity with `limit: 1`, then uses `items.length` as the displayed count.
**Verification**: Source code at `apps/native/app/(tabs)/index.tsx` confirms:

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

With `limit: 1`, the API returns at most 1 item. `items.length` is always 0 or 1. A user with 200 clients sees "1 Client". Confirmed broken dashboard.

---

### Finding 2: Detail Pages Fire tRPC Queries With Empty-String ID — CONFIRMED

**Original**: All four detail screens call `useQuery` with `id: id ?? ""` before the `if (!id)` guard.
**Verification**: Source code confirms the pattern across all four files:

```tsx
// client/[id].tsx:14-16
const { data: client, isLoading } = useQuery(
  trpc.client.read.queryOptions({ id: id ?? "" }),
);
if (!id) { // line 18 — too late

// project/[id].tsx:15-17
const { data: project, isLoading } = useQuery(
  trpc.project.read.queryOptions({ id: id ?? "" }),
);
if (!id) { // line 19

// ticket/[id].tsx:15-17
const { data: ticket, isLoading } = useQuery(
  trpc.ticket.read.queryOptions({ id: id ?? "" }),
);
if (!id) { // line 19

// exchange/[id].tsx:12-14
const { data: exchange, isLoading } = useQuery(
  trpc.exchange.read.queryOptions({ id: id ?? "" }),
);
if (!id) { // line 16
```

React hooks must be called unconditionally, so the query fires with `id: ""` whenever `id` is undefined. This makes an unnecessary network request. The fix is to add `enabled: !!id` to each query options. Confirmed.

---

### Finding 3: DRY Violation — `getErrorMessage` Duplicated Verbatim — CONFIRMED

**Original**: `getErrorMessage` helper function copy-pasted in sign-in.tsx and sign-up.tsx.
**Verification**: Source code confirms identical 26-line functions in both files:

```tsx
// sign-in.tsx:24-49
function getErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") { return error; }
  if (Array.isArray(error)) { /* recursive extraction */ }
  if (typeof error === "object" && error !== null) { /* extract .message */ }
  return null;
}

// sign-up.tsx:25-50 — identical function body
function getErrorMessage(error: unknown): string | null { ... }
```

Character-for-character identical. Per AGENTS.md: "Never redeclare across files." Confirmed DRY violation.

---

### Finding 4: DRY Violation — `DetailRow` Component Duplicated — CONFIRMED

**Original**: `DetailRow` defined separately in client and project detail screens with subtle differences.
**Verification**: Source code confirms:

```tsx
// client/[id].tsx:141-162 — returns null for falsy values, py-1.5
function DetailRow({ icon, label, value, muted }: { ... }) {
  if (!value) return null;
  return (<View className="flex-row items-center py-1.5"> ... </View>);
}

// project/[id].tsx:156-176 — always renders, py-1
function DetailRow({ icon, label, value, muted }: { ... }) {
  return (<View className="flex-row items-center py-1"> ... </View>);
}
```

Two differences: (1) client version returns `null` for falsy values while project version always renders; (2) padding `py-1.5` vs `py-1`. Per AGENTS.md: "Search for existing components before creating new ones." Confirmed.

---

### Finding 5: Create-Ticket Pre-Selection Broken for Non-Active Projects — CONFIRMED

**Original**: Pre-selected non-active project shows confusing "Change" label because list filters by `status: "active"`.
**Verification**: Source code at `apps/native/app/create-ticket.tsx` confirms:

```tsx
// Lines 27-29 — pre-selects from params
const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
  params.projectId ?? null,
);

// Lines 36-39 — only fetches active projects
const { data: projectsData } = useQuery(
  trpc.project.list.queryOptions({ limit: 100, status: "active" }),
);
const projects = projectsData?.items ?? [];

// Line 93 — fallback to "Change" when project not found
{projects.find((p) => p.id === selectedProjectId)?.name ?? "Change"}
```

If the source project is `completed`, `on_hold`, or `archived`, it won't appear in the fetched list. The pre-selected ID is set but the name lookup fails, showing "Change". Confirmed confusing UX.

---

### Finding 6: Unbounded `invalidateQueries()` After Every Mutation — CONFIRMED

**Original**: Every mutation handler calls `queryClient.invalidateQueries()` with no arguments.
**Verification**: Source code confirms across all mutation files:

```tsx
// create-client.tsx:43
queryClient.invalidateQueries();

// create-project.tsx:41
queryClient.invalidateQueries();

// create-ticket.tsx:52
queryClient.invalidateQueries();

// create-exchange.tsx:56
queryClient.invalidateQueries();

// client/[id].tsx:46,59
queryClient.invalidateQueries();

// project/[id].tsx:47
queryClient.invalidateQueries();

// ticket/[id].tsx:47
queryClient.invalidateQueries();

// (tabs)/index.tsx:122
queryClient.invalidateQueries();
```

All 8 instances use no filter arguments, invalidating every query in the React Query cache. Creating a client refetches all projects, tickets, exchanges, and dashboard stats. Confirmed.

---

### Finding 7: Unused Import in Exchange Detail — CONFIRMED

**Original**: `useThemeColor` imported but never called in `exchange/[id].tsx`.
**Verification**: Source code at `apps/native/app/exchange/[id].tsx:3` confirms:

```tsx
import { Spinner, Surface, useThemeColor } from "heroui-native"; // line 3
```

The component body uses `Spinner` and `Surface` but never calls `useThemeColor()`. The JSX uses `text-muted` CSS classes directly instead of themed colors. Confirmed dead import.

---

## Summary

| # | Verdict  | Severity | File | Issue |
|---|----------|----------|------|-------|
| 1 | CONFIRMED | HIGH | `(tabs)/index.tsx` | Dashboard stats always show 0 or 1 due to `limit: 1` |
| 2 | CONFIRMED | MEDIUM | All 4 detail pages | Queries fire with empty-string ID before guard |
| 3 | CONFIRMED | MEDIUM | `sign-in.tsx`, `sign-up.tsx` | `getErrorMessage` duplicated verbatim |
| 4 | CONFIRMED | MEDIUM | `client/[id].tsx`, `project/[id].tsx` | `DetailRow` duplicated with subtle differences |
| 5 | CONFIRMED | MEDIUM | `create-ticket.tsx` | Pre-selected non-active project shows "Change" |
| 6 | CONFIRMED | MEDIUM | 8 mutation handlers | `invalidateQueries()` with no filters refetches everything |
| 7 | CONFIRMED | LOW | `exchange/[id].tsx` | Unused `useThemeColor` import |

**Result: 7 CONFIRMED, 0 DISMISSED**
