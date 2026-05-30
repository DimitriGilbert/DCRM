# Review Report — Cluster 36: Native Detail Screens, Create Screens & Components

**Reviewer**: Code Reviewer (Cluster 36)
**Date**: 2026-05-30
**Scope**: 12 files — 4 detail screens, 4 create screens, 4 shared components

---

## Summary

Reviewed all 12 files for security vulnerabilities, logic errors, data integrity issues, API contract violations, state management bugs, and error handling gaps. Found **4 real issues** across the detail and create screens. Components (status-badge, sign-in, sign-up, theme-toggle) are clean.

---

### [SEVERITY: HIGH] Finding 1: Detail screens fire network request with empty string ID before null guard

**File**: `apps/native/app/client/[id].tsx:14-16` (identical pattern in `project/[id].tsx:15-17`, `ticket/[id].tsx:15-17`, `exchange/[id].tsx:12-14`)
**Problem**: All four detail screens invoke `useQuery` with `id ?? ""` before the `if (!id)` guard. This fires a tRPC request with `id: ""` every time the screen mounts without a valid ID. The server schema (`z.string().min(1)`) rejects it, but the request is still made. On mobile, this wastes bandwidth and battery on every occurrence. Additionally, the `isLoading` state starts as `true`, so if React batches renders, the user may see a brief loading spinner before the "not found" view appears.
**Evidence**:
```tsx
// client/[id].tsx:14-24
const { data: client, isLoading } = useQuery(
  trpc.client.read.queryOptions({ id: id ?? "" }),  // fires with "" when id is undefined
);

if (!id) {  // guard comes AFTER query is already initiated
  return <Text>Client not found</Text>;
}
```
**Impact**: Wasted network request with invalid payload on every mount without ID. Could cause a flash of loading UI. Four files affected.
**Suggestion**: Disable the query when `id` is absent:
```tsx
const { data: client, isLoading } = useQuery({
  ...trpc.client.read.queryOptions({ id: id! }),
  enabled: !!id,
});

if (!id) {
  return <Text>Client not found</Text>;
}
```
When `enabled` is `false`, React Query skips the fetch, `isLoading` stays `false`, and `data` is `undefined` — the guard catches it instantly with no network call.

---

### [SEVERITY: HIGH] Finding 2: create-exchange allows creating orphan exchanges with no entity reference

**File**: `apps/native/app/create-exchange.tsx:43-65`
**Problem**: The `handleSubmit` function sends `clientId`, `projectId`, and `ticketId` directly from URL params. None of these are required — all three can be `undefined` simultaneously. The tRPC server schema also makes all three optional. This allows creating exchange records not linked to any client, project, or ticket — orphaned data in a CRM.
**Evidence**:
```tsx
// create-exchange.tsx:20-24 — params are all optional
const params = useLocalSearchParams<{
  clientId?: string;
  projectId?: string;
  ticketId?: string;
}>();

// create-exchange.tsx:46-54 — all three passed as-is, any could be undefined
await trpcClient.exchange.create.mutate({
  type: exchangeType as (typeof EXCHANGE_TYPES)[number],
  direction: direction as (typeof DIRECTIONS)[number],
  subject: subject.trim() || undefined,
  body: body.trim() || undefined,
  clientId: params.clientId,    // undefined
  projectId: params.projectId,  // undefined
  ticketId: params.ticketId,    // undefined
  isInternal: exchangeType === "note",
});
```
The submit button is only gated by `isSubmitting`:
```tsx
<Button isDisabled={isSubmitting} onPress={handleSubmit}>
```
**Impact**: Creates exchange records with no parent entity — orphaned data that won't appear in any detail screen's exchange list (since those queries filter by `clientId`/`projectId`/`ticketId`). Silent data loss from the user's perspective.
**Suggestion**: Guard the submit and disable the button when no entity context exists:
```tsx
const hasContext = !!(params.clientId || params.projectId || params.ticketId);

async function handleSubmit() {
  if (!hasContext) return;
  // ...
}

<Button isDisabled={isSubmitting || !hasContext} onPress={handleSubmit}>
```

---

### [SEVERITY: MEDIUM] Finding 3: Delete actions execute on single tap with no confirmation

**File**: `apps/native/app/client/[id].tsx:42-53`, `apps/native/app/project/[id].tsx:43-54`, `apps/native/app/ticket/[id].tsx:43-54`
**Problem**: All three detail screens wire `handleDelete` directly to `onPress` with no confirmation dialog. On touch devices, accidental taps are common. The delete executes immediately, invalidates all queries, and navigates back. While these are soft-deletes (recoverable via the API), only the client detail screen exposes a restore button — projects and tickets have no restore UI in the native app, making the action effectively irreversible from the user's perspective.
**Evidence**:
```tsx
// project/[id].tsx:140-148 — delete button, no confirmation
{!project.deletedAt ? (
  <Pressable
    className="..."
    onPress={handleDelete}  // fires immediately on tap
  >
    <Text>Delete</Text>
  </Pressable>
) : null}
// Note: no restore button like client has
```
**Impact**: Accidental data deletion on mobile. Projects and tickets cannot be restored from the native app (no restore UI like clients have).
**Suggestion**: Add an `Alert.alert` confirmation before executing delete:
```tsx
async function handleDelete() {
  Alert.alert("Delete", "Are you sure? This can be restored later.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: async () => {
        try {
          await trpcClient.project.softDelete.mutate({ id: project.id });
          queryClient.invalidateQueries();
          router.back();
          toast.show({ variant: "success", label: "Project deleted" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to delete";
          toast.show({ variant: "danger", label: message });
        }
      },
    },
  ]);
}
```
And add a restore button for projects and tickets, matching the pattern in `client/[id].tsx:115-131`.

---

### [SEVERITY: MEDIUM] Finding 4: create-client has no client-side validation on required name field

**File**: `apps/native/app/create-client.tsx:23-53`
**Problem**: The form uses `@tanstack/react-form` without any validators. The `name` field is marked with `*` in the UI label but has no validation rule. The submit callback sends `value.name.trim()` which can be an empty string. The button has no disabled check for empty name either. The server catches it (`z.string().min(1)`), but the user sees a generic error toast rather than inline field validation. This is inconsistent with the auth forms (`sign-in.tsx`, `sign-up.tsx`) which use Zod schemas for proper validation.
**Evidence**:
```tsx
// create-client.tsx:23-53 — no validators
const form = useForm({
  defaultValues: { name: "", email: "", ... },
  onSubmit: async ({ value }) => {
    // No validation — name.trim() could be ""
    await trpcClient.client.create.mutate({
      name: value.name.trim(),  // could be ""
    });
  },
});
```
Compare with `sign-in.tsx` which properly validates:
```tsx
const form = useForm({
  defaultValues: { email: "", password: "" },
  validators: { onSubmit: signInSchema },  // Zod schema validation
  onSubmit: ...
});
```
The submit button in create-client is only gated by `isSubmitting`, not by name validity:
```tsx
<Button isDisabled={isSubmitting}>Create</Button>
```
While `create-project.tsx` and `create-ticket.tsx` at least check `!name.trim()` and `!title.trim()` in their button disabled state.
**Impact**: User can submit the form with an empty name and gets a server error toast instead of inline validation. Inconsistent UX compared to auth forms and other create screens.
**Suggestion**: Add a Zod validator (matching the established pattern in auth forms) or at minimum add a disabled guard:
```tsx
const form = useForm({
  defaultValues: { name: "", ... },
  validators: {
    onSubmit: z.object({
      name: z.string().trim().min(1, "Name is required"),
      email: z.string().trim().optional(),
      // ...
    }),
  },
  onSubmit: async ({ value }) => { ... },
});
```

---

## Clean Files (No Issues Found)

- **`apps/native/components/status-badge.tsx`** — Straightforward lookup with fallback. No issues.
- **`apps/native/components/sign-in.tsx`** — Proper Zod validation, correct auth flow, proper error handling.
- **`apps/native/components/sign-up.tsx`** — Same quality as sign-in. Duplicated `getErrorMessage` helper with sign-in (DRY violation) but not a bug.
- **`apps/native/components/theme-toggle.tsx`** — Clean toggle with haptic feedback and animation. No issues.
- **`apps/native/app/exchange/[id].tsx`** — Same query-before-guard issue as Finding 1 (already covered). Otherwise clean read-only detail view.
