# Code Review Report — Cluster 29

**Reviewer**: Code Review Expert  
**Date**: 2026-05-30  
**Session**: session-20260530-111722  

**Files Reviewed**:
1. `apps/web/src/components/header.tsx`
2. `apps/web/src/components/loader.tsx`
3. `apps/web/src/components/user-menu.tsx`
4. `apps/web/src/components/sign-in-form.tsx`
5. `apps/web/src/components/sign-up-form.tsx`
6. `apps/web/src/components/global-search.tsx`
7. `apps/web/src/components/notification-bell.tsx`
8. `apps/web/src/components/exchange-timeline.tsx`

---

### [SEVERITY: CRITICAL] Finding 1: Exchange search navigation uses exchange ID as client ID — always broken

**File**: `apps/web/src/components/global-search.tsx:86`  
**Problem**: When a user clicks an exchange search result, the code navigates to `/clients/$clientId` but passes the exchange's `id` as the `clientId` parameter. This will always produce a wrong navigation — the router will attempt to load a client whose ID is actually an exchange ID, resulting in a 404 or displaying completely wrong data.

The exchange table (`packages/db/src/schema/crm.ts:219`) has a separate `clientId` foreign key column, and the search result (`SearchResultItem` in `packages/api/src/routers/search/schemas.ts:73-80`) only returns the exchange entity's own `id` — it does not include the exchange's `clientId`. So even if the intent was to navigate to the parent client, the data isn't available.

**Evidence**:
```ts
// global-search.tsx:84-88
case "exchange":
  void navigate({ to: "/clients/$clientId", params: { clientId: entityId } });
  break;
```
`entityId` here is `item.id` (line 148), which is the exchange's primary key — not the client's ID.

**Impact**: Every exchange search result click takes the user to a non-existent client page. This is a broken user flow for all exchange search results.

**Suggestion**: Two-part fix required:

1. **API layer** — Extend `SearchResultItem` to carry parent context for nested entities. The `searchExchanges` function in `packages/api/src/routers/search/global.ts:282-289` should include `clientId` from the exchange row. Similarly, `searchTickets` should include `projectId`. Add optional fields to `SearchResultItem`:
   ```ts
   export interface SearchResultItem {
     id: string;
     entityType: SearchEntityType;
     label: string;
     sublabel: string | null;
     status: string | null;
     createdAt: Date;
     parentId?: string;      // e.g., clientId for exchanges, projectId for tickets
     parentType?: string;    // e.g., "client", "project"
   }
   ```

2. **Frontend** — Use the parent context for navigation:
   ```ts
   case "exchange":
     if (item.parentId) {
       void navigate({ to: "/clients/$clientId", params: { clientId: item.parentId } });
     }
     break;
   ```

---

### [SEVERITY: HIGH] Finding 2: Ticket search result navigates to placeholder list page instead of specific ticket

**File**: `apps/web/src/components/global-search.tsx:83`  
**Problem**: When a user clicks a ticket search result, the code navigates to `/tickets/` (the ticket list index) and completely discards the entity ID. The actual ticket detail route is `/projects/$projectId/tickets/$ticketId`, which requires both a `projectId` and `ticketId`. The current navigation lands on a "coming soon" placeholder page (`apps/web/src/routes/_authenticated/tickets/index.tsx`), making ticket search results non-functional.

**Evidence**:
```ts
// global-search.tsx:83-84
case "ticket":
  void navigate({ to: "/tickets/", params: {} });
  break;
```
Compare with the working client navigation:
```ts
case "client":
  void navigate({ to: "/clients/$clientId", params: { clientId: entityId } });
  break;
```

**Impact**: Clicking any ticket in search results shows a "Tickets coming soon" placeholder. The user cannot reach the specific ticket they searched for. All other entity types (client, lead, project) navigate correctly to their detail pages.

**Suggestion**: The ticket route requires `projectId` which is not available in `SearchResultItem`. Fix the API to include `parentId` (the `projectId`) in ticket search results (see Finding 1 suggestion), then:
```ts
case "ticket":
  if (item.parentId) {
    void navigate({
      to: "/projects/$projectId/tickets/$ticketId",
      params: { projectId: item.parentId, ticketId: entityId },
    });
  }
  break;
```

---

### [SEVERITY: MEDIUM] Finding 3: Sign-out in user menu has no error handling

**File**: `apps/web/src/components/user-menu.tsx:42-55`  
**Problem**: The sign-out action calls `authClient.signOut()` with only an `onSuccess` callback. If the sign-out API call fails (network error, server error, session already invalidated), the user receives no feedback. The dropdown closes, giving the false impression that sign-out succeeded while the session may still be active.

**Evidence**:
```ts
// user-menu.tsx:42-55
<DropdownMenuItem
  variant="destructive"
  onClick={() => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({
            to: "/",
          });
        },
      },
    });
  }}
>
```

**Impact**: Silent failure on sign-out. The user thinks they're signed out but the session persists. On next interaction they may encounter confusing auth errors, or worse, if on a shared device, the session remains active.

**Suggestion**: Add an `onError` callback:
```ts
authClient.signOut({
  fetchOptions: {
    onSuccess: () => {
      navigate({ to: "/" });
    },
    onError: (ctx) => {
      toast.error("Failed to sign out. Please try again.");
    },
  },
});
```
Also import `toast` from `sonner` (already used in other form components in this project).

---

### [SEVERITY: MEDIUM] Finding 4: Loader component is invisible to screen readers

**File**: `apps/web/src/components/loader.tsx:3-9`  
**Problem**: The `Loader` component renders a spinning icon with no accessible label. Screen reader users hear nothing when loading state is active — they have no indication that content is loading or that they should wait. This is a WCAG 2.1 Level A violation (criterion 1.3.1 Info and Relationships, 4.1.2 Name Role Value).

This component is used as a full-page loading state in `sign-in-form.tsx:52` and `sign-up-form.tsx:54`.

**Evidence**:
```tsx
// loader.tsx:3-9
export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <Loader2 className="animate-spin" />
    </div>
  );
}
```
No `aria-label`, no `role="status"`, no visually-hidden text.

**Impact**: Screen reader users are unaware that the application is in a loading state. They may assume the page is broken or empty.

**Suggestion**:
```tsx
export default function Loader() {
  return (
    <div role="status" className="flex h-full items-center justify-center pt-8">
      <Loader2 className="animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
```

---

## Summary

| Severity | Count | Files Affected |
|----------|-------|----------------|
| CRITICAL | 1     | `global-search.tsx` |
| HIGH     | 1     | `global-search.tsx` |
| MEDIUM   | 2     | `user-menu.tsx`, `loader.tsx` |
| **Total**| **4** | |

**Files with no real issues**: `header.tsx`, `sign-in-form.tsx`, `sign-up-form.tsx`, `notification-bell.tsx`, `exchange-timeline.tsx`

**Note**: Findings 1 and 2 share a root cause — the `SearchResultItem` type in `packages/api/src/routers/search/schemas.ts` lacks parent entity context. The frontend navigation bugs cannot be fully fixed without also extending the API response to include `clientId` for exchanges and `projectId` for tickets. This is an API-layer concern but the broken navigation manifests entirely in the frontend components reviewed here.
