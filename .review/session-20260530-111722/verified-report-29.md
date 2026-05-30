# Verified Code Review Report — Cluster 29

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-29.md

---

### Finding 1: Exchange search navigation uses exchange ID as client ID — CONFIRMED

**Original**: Clicking an exchange search result navigates to `/clients/$clientId` with the exchange's own ID as `clientId`.
**Verification**: Source code at `apps/web/src/components/global-search.tsx` confirms:

```ts
// Line 69-70: handleSelect receives entityId which is item.id
const handleSelect = useCallback(
  (entityType: string, entityId: string) => {

// Line 85-86: exchange case passes exchange's ID as clientId
case "exchange":
  void navigate({ to: "/clients/$clientId", params: { clientId: entityId } });

// Line 148: entityId = item.id — the exchange's primary key
onSelect={() => handleSelect(item.entityType, item.id)}
```

The `SearchResultItem` interface (`packages/api/src/routers/search/schemas.ts:73-80`) has no `parentId` field. Every exchange search result click navigates to a non-existent client page. Confirmed bug.

---

### Finding 2: Ticket search result navigates to placeholder list page — CONFIRMED

**Original**: Ticket search result navigates to `/tickets/` instead of the specific ticket.
**Verification**: Source code confirms:

```ts
// global-search.tsx:82-83
case "ticket":
  void navigate({ to: "/tickets/", params: {} });
```

Compare with the working client navigation:
```ts
case "client":
  void navigate({ to: "/clients/$clientId", params: { clientId: entityId } });
```

The actual ticket detail route requires `/projects/$projectId/tickets/$ticketId`, which needs a `projectId` not available in `SearchResultItem`. The `/tickets/` route is a placeholder index page. Confirmed broken navigation.

---

### Finding 3: Sign-out in user menu has no error handling — CONFIRMED

**Original**: `authClient.signOut()` has only `onSuccess` callback; failure is silent.
**Verification**: Source code at `apps/web/src/components/user-menu.tsx:42-55` confirms:

```ts
<DropdownMenuItem
  variant="destructive"
  onClick={() => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/" });
        },
        // No onError callback
      },
    });
  }}
>
```

No `onError` handler. If sign-out fails, the dropdown closes with no feedback, and the session persists. Confirmed.

---

### Finding 4: Loader component is invisible to screen readers — CONFIRMED

**Original**: Loader renders spinning icon with no accessible label.
**Verification**: Source code at `apps/web/src/components/loader.tsx:3-9` confirms:

```tsx
export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <Loader2 className="animate-spin" />
    </div>
  );
}
```

No `aria-label`, no `role="status"`, no visually-hidden text. This component is used as full-page loading state in `sign-in-form.tsx:52` and `sign-up-form.tsx:54`. Confirmed WCAG 2.1 Level A violation.

---

## Summary

| # | Verdict  | Severity | File | Issue |
|---|----------|----------|------|-------|
| 1 | CONFIRMED | CRITICAL | `global-search.tsx` | Exchange search passes exchange ID as client ID — always broken |
| 2 | CONFIRMED | HIGH | `global-search.tsx` | Ticket search navigates to placeholder, discards entity ID |
| 3 | CONFIRMED | MEDIUM | `user-menu.tsx` | No error handling on sign-out failure |
| 4 | CONFIRMED | MEDIUM | `loader.tsx` | No accessible label for screen readers |

**Result: 4 CONFIRMED, 0 DISMISSED**
