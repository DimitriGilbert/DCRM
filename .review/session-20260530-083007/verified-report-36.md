# Verified Code Review Report — Cluster 36: Native Detail Screens, Create Screens & Components

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-36.md

---

## Verification Results

### Finding 1: Detail screens fire network request with empty string ID before null guard

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `client/[id].tsx:14-16`:
  ```tsx
  const { data: client, isLoading } = useQuery(
    trpc.client.read.queryOptions({ id: id ?? "" }),
  );
  // ...
  if (!id) { return <Text>Client not found</Text>; }
  ```
- `project/[id].tsx:15-17`: Same pattern — `trpc.project.read.queryOptions({ id: id ?? "" })` before `if (!id)` guard.
- `ticket/[id].tsx:15-17`: Same pattern.
- `exchange/[id].tsx:12-14`: Same pattern.

**Impact**: Confirmed. When `id` is undefined/null (which can happen during initial route resolution or navigation edge cases), the query fires with `id: ""`. The API schema `z.string().min(1)` rejects it, but the HTTP request is still made. On mobile, this wastes bandwidth and battery. Additionally, `isLoading` starts as `true`, potentially showing a spinner briefly before the "not found" view. The fix is to use `enabled: !!id` in query options.

---

### Finding 2: create-exchange allows creating orphan exchanges with no entity reference

**Verdict**: ✅ CONFIRMED (with context nuance)

**Evidence from source**:
- `create-exchange.tsx:20-24`: All three params are optional:
  ```tsx
  const params = useLocalSearchParams<{
    clientId?: string;
    projectId?: string;
    ticketId?: string;
  }>();
  ```
- `create-exchange.tsx:46-54`: All three passed as-is — any could be undefined:
  ```tsx
  await trpcClient.exchange.create.mutate({
    clientId: params.clientId,   // undefined
    projectId: params.projectId, // undefined
    ticketId: params.ticketId,   // undefined
  });
  ```
- `create-exchange.tsx:154-157`: Button is only gated by `isSubmitting`:
  ```tsx
  <Button isDisabled={isSubmitting} onPress={handleSubmit}>
  ```
- The screen CAN be navigated to directly (e.g., via deep link or manual URL) without entity context params.

**Impact**: Confirmed. The form can be reached without entity context (e.g., via deep link), and an exchange with no client/project/ticket linkage can be created. This orphan data won't appear in any detail screen's exchange list. However, in practice, the navigation patterns in this app always pass at least one entity context (the "Add Exchange" buttons on detail screens always include params). The risk is from deep links or direct URL navigation. The fix (guarding on `hasContext`) is still recommended.

---

### Finding 3: Delete actions execute on single tap with no confirmation

**Verdict**: ✅ CONFIRMED

**Evidence from source**:
- `client/[id].tsx:42-53`: `handleDelete` directly wired to `onPress` — no `Alert.alert` confirmation.
- `project/[id].tsx:43-54`: Same — direct `handleDelete` on tap.
- `ticket/[id].tsx:43-54`: Same — direct `handleDelete` on tap.
- The client detail has a restore button (lines 115-131), but project and ticket details have NO restore button — only a conditional delete button.
- On touch devices, accidental taps are common. The delete is immediate with no undo confirmation.

**Impact**: Confirmed. Single-tap delete on touch devices without confirmation is dangerous UX. While these are soft-deletes (recoverable via API), projects and tickets have no restore UI in the native app, making them effectively irreversible from the user's perspective. Only the client detail has a restore button. The suggestion to use `Alert.alert` confirmation is appropriate for mobile.

---

### Finding 4: create-client has no client-side validation on required name field

**Verdict**: ✅ CONFIRMED (with nuance)

**Evidence from source**:
- `create-client.tsx:23-53`: `useForm` with no `validators` option:
  ```tsx
  const form = useForm({
    defaultValues: { name: "", email: "", ... },
    onSubmit: async ({ value }) => {
      await trpcClient.client.create.mutate({
        name: value.name.trim(),  // could be ""
      });
    },
  });
  ```
- `create-client.tsx:172`: Button only disabled by `isSubmitting`:
  ```tsx
  <Button isDisabled={isSubmitting}>
  ```
- Compare with `sign-in.tsx` which uses `validators: { onSubmit: signInSchema }`.
- However, `create-client.tsx:35-41` does convert empty strings to `undefined` for optional fields (`value.email.trim() || undefined`), and the server catches empty name via `z.string().min(1)`.

**Impact**: Confirmed. The user can submit with an empty name and gets a generic server error toast instead of inline field validation. The server does catch it, so no bad data is stored. But the UX is inconsistent with auth forms which have proper Zod validation. The submit button should also be disabled when name is empty, similar to `create-project.tsx` and `create-ticket.tsx` which check `!name.trim()` / `!title.trim()` in their button disabled state.

---

## Summary

| # | Verdict | Severity | File | Issue |
|---|---------|----------|------|-------|
| 1 | ✅ CONFIRMED | HIGH | `client/[id].tsx`, `project/[id].tsx`, `ticket/[id].tsx`, `exchange/[id].tsx` | Query fires with empty ID before null guard |
| 2 | ✅ CONFIRMED | HIGH | `create-exchange.tsx` | Orphan exchanges with no entity reference possible |
| 3 | ✅ CONFIRMED | MEDIUM | `client/[id].tsx`, `project/[id].tsx`, `ticket/[id].tsx` | Delete on single tap with no confirmation dialog |
| 4 | ✅ CONFIRMED | MEDIUM | `create-client.tsx` | No client-side validation on required name field |

**All 4 findings confirmed. 0 dismissed.**

---

## Clean Files (Verified — No Issues)

- **`apps/native/components/status-badge.tsx`** — Clean lookup with fallback. No issues.
- **`apps/native/components/sign-in.tsx`** — Proper Zod validation, correct auth flow.
- **`apps/native/components/sign-up.tsx`** — Same quality as sign-in.
- **`apps/native/components/theme-toggle.tsx`** — Clean toggle with haptic feedback. No issues.
