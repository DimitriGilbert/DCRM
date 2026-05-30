# Code Review Report — Cluster 34

**Reviewer**: Code Review Expert (Cluster 34)
**Date**: 2026-05-30
**Scope**: Dashboard, AI Chat, Settings, Onboarding routes

---

### [SEVERITY: HIGH] Finding 1: Dashboard Stat Cards Always Show 0 or 1 Instead of Actual Counts

**File**: apps/web/src/routes/_authenticated/dashboard.tsx:73-97
**Problem**: The dashboard fetches clients, projects, and tickets with `limit: 1` and then uses `items.length` to display the total count. The API returns a cursor-paginated response `{ items, nextCursor }` with **no `total` field**. With `limit: 1`, the API returns at most 1 item per query. Therefore `items.length` will always be 0 or 1, making the stat cards completely incorrect when the user has more than one client, project, or ticket.

**Evidence**:
```tsx
// Line 73-81: Fetching with limit: 1
const clientsQuery = useQuery(
    trpc.client.list.queryOptions({ limit: 1 }),
);
const projectsQuery = useQuery(
    trpc.project.list.queryOptions({ limit: 1, status: "active" }),
);
const ticketsQuery = useQuery(
    trpc.ticket.list.queryOptions({ limit: 1, status: "open" }),
);

// Line 95-97: Using items.length as the count
const activeClientsCount = clientsQuery.data?.items.length ?? 0;
const activeProjectsCount = projectsQuery.data?.items.length ?? 0;
const openTicketsCount = ticketsQuery.data?.items.length ?? 0;
```

The API response (confirmed in `packages/api/src/routers/client/list.ts`) returns:
```ts
return { items, nextCursor };
// No `total` field exists
```

**Impact**: The three "Active Clients", "Active Projects", and "Open Tickets" stat cards are the primary dashboard metrics. They will always display "1" (if any records exist) regardless of actual counts. A user with 50 clients sees "1". This renders the dashboard overview non-functional for its core purpose.

**Suggestion**: Add dedicated `count` endpoints to the API routers, or use a high limit and rely on items length only if the counts are guaranteed small. The cleanest fix is to add a `count` procedure to each router:
```ts
// In packages/api/src/routers/client/count.ts
export const countClients = protectedProcedure
  .input(z.object({ includeDeleted: z.boolean().default(false) }))
  .query(async ({ ctx, input }) => {
    // SELECT COUNT(*) FROM clients WHERE userId = ? AND ...
  });
```
Then on the dashboard:
```tsx
const clientsCountQuery = useQuery(
  trpc.client.count.queryOptions(),
);
const activeClientsCount = clientsCountQuery.data ?? 0;
```

---

### [SEVERITY: HIGH] Finding 2: AI Chat Silently Loses User Message on Send Failure

**File**: apps/web/src/routes/_authenticated/ai-chat.tsx:68-78
**Problem**: `setInput("")` is called immediately after `sendMessageMutation.mutate()`, before the mutation resolves. If the mutation fails (network error, server error, etc.), the user's message text is irrecoverably lost. Additionally, the `sendMessageMutation` has no `onError` handler, so the user receives zero feedback about the failure — the message simply vanishes with no error toast.

**Evidence**:
```tsx
// Lines 68-78
function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !defaultProvider) return;

    sendMessageMutation.mutate({
      content: trimmed,
      providerId: defaultProvider.id,
    });
    setInput("");  // Cleared immediately, mutation hasn't completed
}

// Lines 33-41: No onError handler
const sendMessageMutation = useMutation(
    trpc.aiChat.sendMessage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.aiChat.listMessages.queryFilter(),
        );
      },
      // No onError — user gets no feedback on failure
    }),
);
```

**Impact**: On any network hiccup or server error, the user's composed message disappears permanently with no error indication. This is a data-loss UX bug that is especially painful for longer, carefully composed messages. Users may think the message was sent successfully.

**Suggestion**: Clear input only on mutation success, and add error handling:
```tsx
const sendMessageMutation = useMutation(
    trpc.aiChat.sendMessage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.aiChat.listMessages.queryFilter(),
        );
      },
      onError: (error) => {
        toast.error("Failed to send message", { description: error.message });
      },
    }),
);

function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !defaultProvider) return;

    const content = trimmed;
    setInput(""); // Optimistic clear is ok if we restore on error
    sendMessageMutation.mutate(
      { content, providerId: defaultProvider.id },
      {
        onError: () => {
          setInput(content); // Restore on failure
        },
      },
    );
}
```

---

### [SEVERITY: MEDIUM] Finding 3: Render-Phase Side Effects — `navigate()` Called During Render

**File**: apps/web/src/routes/_authenticated/onboarding/email-setup.tsx:38-41 and apps/web/src/routes/_authenticated/onboarding/ai-setup.tsx:37-40
**Problem**: Both onboarding sub-pages call `navigate()` during the component render phase as a side effect. React does not support side effects during render — they should be performed in `useEffect` or event handlers. This causes issues with React's concurrent rendering mode and can produce warnings or unexpected behavior.

**Evidence**:
```tsx
// email-setup.tsx lines 37-41
const onboardingCompleted = settingsQuery.data?.onboardingCompleted ?? false;

if (onboardingCompleted) {
    void navigate({ to: "/dashboard" }); // Side effect during render
    return null;
}

// ai-setup.tsx lines 36-40 — same pattern
const onboardingCompleted = settingsQuery.data?.onboardingCompleted ?? false;

if (onboardingCompleted) {
    void navigate({ to: "/dashboard" }); // Side effect during render
    return null;
}
```

The main onboarding page (`onboarding/index.tsx`) correctly uses `useEffect` for the same redirect (lines 63-67):
```tsx
useEffect(() => {
    if (onboardingCompleted) {
      void navigate({ to: "/dashboard" });
    }
}, [onboardingCompleted, navigate]);
```

**Impact**: Render-phase side effects are undefined behavior in React. In concurrent mode, the render function can be called multiple times before commit, causing duplicate navigations. It can also cause the component to return `null` before the navigation completes, leading to a flash of empty content. This inconsistency between the main onboarding page and its sub-pages suggests the pattern was corrected in one place but not the others.

**Suggestion**: Move the navigation into a `useEffect` in both files, matching the pattern already used in `onboarding/index.tsx`:
```tsx
useEffect(() => {
    if (onboardingCompleted) {
      void navigate({ to: "/dashboard" });
    }
}, [onboardingCompleted, navigate]);

if (onboardingCompleted) {
    return null;
}
```

---

### [SEVERITY: MEDIUM] Finding 4: Unsafe Type Assertion Masks API Contract Violations in AI Chat

**File**: apps/web/src/routes/_authenticated/ai-chat.tsx:53-59
**Problem**: The `m.role` value from the API is cast with `as "user" | "assistant" | "system"` without any validation. If the API returns a role value outside this union (e.g., `"tool"`, `"function"`, or a typo like `"asistant"`), the type system won't catch it and the runtime behavior silently degrades — such messages would be rendered as "Assistant" messages regardless.

**Evidence**:
```tsx
// Lines 53-59
const messages: ChatMessage[] =
    messagesQuery.data?.items.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",  // Unsafe cast
      content: m.content,
      createdAt: m.createdAt,
    })).reverse() ?? [];
```

The rendering code at line 140 branches on `msg.role === "user"`:
```tsx
{msg.role === "user" ? (
    <User className="h-4 w-4 text-muted-foreground" />
) : (
    <Bot className="h-4 w-4 text-muted-foreground" />
)}
```

**Impact**: If the backend ever adds a new role (e.g., `"tool"` for function-calling results), or if a data migration introduces an unexpected value, those messages would silently render as "Assistant" messages. The `as` assertion hides the discrepancy from TypeScript, making it hard to diagnose.

**Suggestion**: Use a type guard or validation:
```tsx
const VALID_ROLES = ["user", "assistant", "system"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

function parseRole(role: string): ValidRole {
  if (VALID_ROLES.includes(role as ValidRole)) return role as ValidRole;
  return "system"; // Fallback
}

const messages: ChatMessage[] =
    messagesQuery.data?.items.map((m) => ({
      id: m.id,
      role: parseRole(m.role),
      content: m.content,
      createdAt: m.createdAt,
    })).reverse() ?? [];
```

---

### Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | HIGH | dashboard.tsx:73-97 | Stat cards always show 0 or 1 due to `limit:1` + `items.length` with no `total` field from API |
| 2 | HIGH | ai-chat.tsx:68-78 | User message text silently lost on send failure; no error feedback |
| 3 | MEDIUM | onboarding/email-setup.tsx:38-41, ai-setup.tsx:37-40 | `navigate()` called during render phase instead of `useEffect` |
| 4 | MEDIUM | ai-chat.tsx:53-59 | Unsafe `as` type assertion on API role field masks contract violations |
