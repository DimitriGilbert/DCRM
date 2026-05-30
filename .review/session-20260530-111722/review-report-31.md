# Code Review Report — Cluster 31

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Scope**: Dashboard, AI Chat, Project CRUD (5 files), Ticket CRUD (4 files), Tickets index

---

### [SEVERITY: CRITICAL] Finding 1: Empty-string dates from create forms fail API datetime validation

**File**: apps/web/src/routes/_authenticated/projects/create.tsx:64, apps/web/src/routes/_authenticated/projects/index.tsx:174, apps/web/src/routes/_authenticated/projects/$projectId/tickets/create.tsx:72

**Problem**: The create forms for both projects and tickets send raw form values — including empty-string dates (`""`) — directly to the tRPC API. The API schemas require `z.string().datetime().optional()` for date fields. An empty string `""` is neither `undefined` nor a valid ISO datetime, so the API Zod validation rejects it. This causes every project/ticket creation to fail with a validation error **unless the user explicitly fills in all date fields**.

**Evidence**:

Form default values set dates to `""`:
```ts
// project-form-schema.ts:105-106
startDate: "",
endDate: "",

// ticket-form-schema.ts:80
dueDate: "",
```

Create forms pass raw values without cleaning:
```ts
// projects/create.tsx:63-64
onSubmit={(values) => {
  createMutation.mutate(values);  // startDate: "", endDate: "" sent as-is
}}

// projects/index.tsx:173-174 (dialog create)
onSubmit={(values) => {
  createMutation.mutate(values);  // same issue
}}

// tickets/create.tsx:71-72
onSubmit={(values) => {
  createMutation.mutate({ projectId, ...values });  // dueDate: "" sent as-is
}}
```

But the API expects ISO datetime format:
```ts
// project schemas.ts:15-16
startDate: z.string().datetime().optional(),
endDate: z.string().datetime().optional(),

// ticket schemas.ts:16
dueDate: z.string().datetime().optional(),
```

Notably, the **edit** forms correctly clean empty strings:
```ts
// $projectId.edit.tsx:108-112
const cleaned = {
  ...values,
  startDate: values.startDate || undefined,
  endDate: values.endDate || undefined,
};

// $ticketId.edit.tsx:94-97
const cleaned = {
  ...values,
  dueDate: values.dueDate || undefined,
};
```

**Impact**: Creating a project or ticket without filling in date fields will always produce a tRPC BAD_REQUEST validation error. This is the default path — most users won't fill in optional dates. The create flow is broken for the common case.

**Suggestion**: Apply the same empty-string-to-undefined cleaning used in the edit forms to all three create call sites:

```ts
// projects/create.tsx and projects/index.tsx
onSubmit={(values) => {
  const cleaned = {
    ...values,
    startDate: values.startDate || undefined,
    endDate: values.endDate || undefined,
  };
  createMutation.mutate(cleaned);
}}

// tickets/create.tsx
onSubmit={(values) => {
  const cleaned = {
    ...values,
    dueDate: values.dueDate || undefined,
  };
  createMutation.mutate({ projectId, ...cleaned });
}}
```

---

### [SEVERITY: HIGH] Finding 2: Destructive delete actions have no confirmation guard

**File**: apps/web/src/routes/_authenticated/projects/$projectId.tsx:122, apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.tsx:129

**Problem**: The "Delete" button on both the project detail page and the ticket detail page fires `softDeleteMutation.mutate()` immediately on click with no confirmation dialog, no `window.confirm()`, and no undo mechanism. A single misclick triggers a soft-delete, immediately navigating the user away from the page.

**Evidence**:
```tsx
// $projectId.tsx:119-126
<Button
  variant="destructive"
  size="sm"
  onClick={() => softDeleteMutation.mutate({ id: project.id })}
  disabled={softDeleteMutation.isPending}
>
  Delete
</Button>

// $ticketId.tsx:126-132
<Button
  variant="destructive"
  size="sm"
  onClick={() => softDeleteMutation.mutate({ id: ticket.id })}
  disabled={softDeleteMutation.isPending}
>
  Delete
</Button>
```

**Impact**: In a CRM, accidental data deletion is a significant data integrity risk. While soft-delete is recoverable (a `restore` endpoint exists in both routers), there is no UI affordance for undo or restore, and the user is navigated away immediately — making the action feel permanent.

**Suggestion**: Wrap the delete action in a confirmation. At minimum, use `window.confirm()`. Ideally, use the existing `Dialog` component from `@DCRM/ui`:
```tsx
onClick={() => {
  if (window.confirm(`Delete "${project.name}"? This can be restored later.`)) {
    softDeleteMutation.mutate({ id: project.id });
  }
}}
```

---

### [SEVERITY: HIGH] Finding 3: `messageRoleSchema.parse()` can crash the AI chat page

**File**: apps/web/src/routes/_authenticated/ai-chat.tsx:61-66

**Problem**: The `messageRoleSchema.parse(m.role)` call uses Zod's `.parse()` which throws on unexpected values. This runs during the render cycle inside the `messagesQuery.data` mapping. If the API returns any role not in `["user", "assistant", "system"]` (e.g., `"tool"`, `"function"`, or a database migration adds a new role), the thrown Zod error is unhandled and crashes the entire component with an Error Boundary / white screen.

**Evidence**:
```ts
// ai-chat.tsx:61-69
const messageRoleSchema = z.enum(["user", "assistant", "system"]);

const messages: ChatMessage[] =
  messagesQuery.data?.items.map((m) => ({
    id: m.id,
    role: messageRoleSchema.parse(m.role),  // throws on unexpected role
    content: m.content,
    createdAt: m.createdAt,
  })).reverse() ?? [];
```

The schema is also recreated on every render (defined inside the component body), which is wasteful.

**Impact**: Any unexpected `role` value from the API causes an unhandled exception during render, making the AI chat page completely unusable. The user sees a blank/broken page with no way to recover except navigating away.

**Suggestion**: Use `.safeParse()` with a fallback, and move the schema outside the component:
```ts
const messageRoleSchema = z.enum(["user", "assistant", "system"]);
type MessageRole = z.infer<typeof messageRoleSchema>;

function AIChatPage() {
  // ...
  const messages: ChatMessage[] =
    messagesQuery.data?.items.map((m) => ({
      id: m.id,
      role: messageRoleSchema.safeParse(m.role).success
        ? messageRoleSchema.parse(m.role)
        : "system" as MessageRole,  // fallback for unknown roles
      content: m.content,
      createdAt: m.createdAt,
    })).reverse() ?? [];
```

---

### [SEVERITY: MEDIUM] Finding 4: Unsafe type assertion on ticket data masks potential string/Date mismatch

**File**: apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.tsx:19-30,77

**Problem**: A local `TicketData` type is defined with `dueDate: Date | null` and `createdAt: Date | null`, and the tRPC query result is cast to it with `as TicketData | null`. However, tRPC data is serialized over the network as JSON, where `Date` objects become ISO strings. The actual runtime type is `string | null`, not `Date | null`. The `as` assertion hides this mismatch. While the current code wraps all date access in `new Date()`, the misleading type makes future code that directly calls `.toLocaleDateString()` on `ticket.dueDate` compile cleanly but crash at runtime.

**Evidence**:
```ts
// lines 19-30
type TicketData = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly type: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: Date | null;      // claimed: Date
  readonly createdAt: Date | null;    // claimed: Date
  readonly projectId: string;
  readonly deletedAt: Date | null;
};

// line 77
const ticket = ticketQuery.data as TicketData | null;  // unsafe cast
```

The tRPC `readTicket` procedure returns the raw Drizzle row. After JSON serialization through React Query, `Date` columns become strings.

**Impact**: The `as` cast creates a false type safety. Any developer who later writes `ticket.dueDate!.toLocaleDateString()` will get no TypeScript error but a runtime crash (`toLocaleDateString is not a function`). The `TicketData` type also declares `deletedAt: Date | null`, so `ticket.deletedAt` (line 90) could also be a string at runtime — though truthy-check works for both.

**Suggestion**: Remove the `TicketData` type and the `as` cast. Use the inferred type from tRPC directly, or define the local type with `string | null` for date fields to match the serialized reality:
```ts
const ticket = ticketQuery.data;
// tRPC already provides the correct type — just use it directly
```

---

### [SEVERITY: MEDIUM] Finding 5: `formatRelativeDate` in dashboard shows negative day strings for overdue items

**File**: apps/web/src/routes/_authenticated/dashboard.tsx:44-55

**Problem**: `formatRelativeDate` returns literal negative-number strings like "-2 days" for past dates. While the color-coding (red for overdue) provides visual distinction, the text itself is confusing — "-2 days" reads as a math expression rather than "2 days overdue" or "2d ago".

**Evidence**:
```ts
// lines 44-55
function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `${diffDays} days`;     // e.g. "-2 days"
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ${diffDays % 7}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

For a deadline 2 days in the past: `diffDays` = -2, returns "-2 days".
For a deadline 3 days in the past: `diffDays` = -3, falls through all conditions, returns the formatted date (which is fine).

The `-2` case produces confusing text; the `-3` case falls through gracefully.

**Impact**: Overdue deadlines that are 1-6 days past show as "-N days" which is a confusing user-facing label in a CRM dashboard.

**Suggestion**: Handle negative `diffDays` explicitly:
```ts
function formatRelativeDate(date: Date | string): string {
  // ...
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays > 0 && diffDays < 7) return `${diffDays} days`;
  if (diffDays > 0 && diffDays < 30) return `${Math.floor(diffDays / 7)}w ${diffDays % 7}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | CRITICAL | create.tsx, index.tsx (projects & tickets) | Empty-string dates cause API validation failure on every create |
| 2 | HIGH | $projectId.tsx, $ticketId.tsx | Destructive delete with no confirmation guard |
| 3 | HIGH | ai-chat.tsx | `.parse()` can crash the component on unexpected API data |
| 4 | MEDIUM | $ticketId.tsx | Unsafe `as` cast masks string/Date type mismatch |
| 5 | MEDIUM | dashboard.tsx | Negative-day display for overdue deadlines |

**Total findings: 5** (1 Critical, 2 High, 2 Medium)
