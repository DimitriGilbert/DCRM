# Verified Code Review Report — Cluster 31

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-31.md

---

### Finding 1: Empty-string dates from create forms fail API datetime validation — CONFIRMED

**Original**: Project/ticket create forms send `""` for unfilled date fields; API requires `z.string().datetime().optional()`.
**Verification**: Full chain confirmed:

**Form defaults are empty strings:**
```ts
// project-form-schema.ts:105-106
startDate: "",
endDate: "",

// ticket-form-schema.ts:80
dueDate: "",
```

**Form schemas accept `""` (no transform):**
```ts
// project-form-schema.ts:13-14
startDate: z.string().optional(),
endDate: z.string().optional(),

// ticket-form-schema.ts:11
dueDate: z.string().optional(),
```

**Create forms pass raw values without cleaning:**
```ts
// projects/create.tsx:64
createMutation.mutate(values);

// projects/index.tsx:174
createMutation.mutate(values);

// tickets/create.tsx:72
createMutation.mutate({ projectId, ...values });
```

**API schemas require valid datetime:**
```ts
// packages/api/src/routers/project/schemas.ts:15-16
startDate: z.string().datetime().optional(),
endDate: z.string().datetime().optional(),

// packages/api/src/routers/ticket/schemas.ts:16
dueDate: z.string().datetime().optional(),
```

Empty string `""` passes the form schema (`z.string().optional()`) but fails the API schema (`z.string().datetime().optional()`). Every project/ticket creation without filled-in dates produces a tRPC BAD_REQUEST error. The edit forms correctly clean with `values.startDate || undefined`, but the create forms do not. Confirmed CRITICAL.

---

### Finding 2: Destructive delete actions have no confirmation guard — CONFIRMED

**Original**: Delete buttons fire `softDeleteMutation.mutate()` immediately with no confirmation.
**Verification**: Source code confirms:

```ts
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

No `window.confirm()`, no Dialog, no undo mechanism. Single click triggers soft-delete and immediate navigation away. Confirmed.

---

### Finding 3: `messageRoleSchema.parse()` can crash the AI chat page — CONFIRMED

**Original**: `.parse()` throws on unexpected roles, crashing the render cycle.
**Verification**: Source code at `ai-chat.tsx:61-69` confirms:

```ts
// Line 61 — schema defined inside component body (recreated each render)
const messageRoleSchema = z.enum(["user", "assistant", "system"]);

// Line 63-69 — .parse() throws during render
const messages: ChatMessage[] =
  messagesQuery.data?.items.map((m) => ({
    id: m.id,
    role: messageRoleSchema.parse(m.role),  // throws on unexpected role
    content: m.content,
    createdAt: m.createdAt,
  })).reverse() ?? [];
```

If the API returns a role like `"tool"` or `"function"`, `z.enum().parse()` throws an unhandled ZodError during the render cycle, crashing the entire component. Also, the schema is recreated on every render unnecessarily. Confirmed.

---

### Finding 4: Unsafe type assertion on ticket data masks potential string/Date mismatch — CONFIRMED

**Original**: Local `TicketData` type claims `Date` fields but tRPC serializes as strings; `as` cast hides the mismatch.
**Verification**: Source code at `$ticketId.tsx:19-30,77` confirms:

```ts
// Lines 19-30 — claims Date type
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

// Line 77 — unsafe cast
const ticket = ticketQuery.data as TicketData | null;
```

tRPC serializes Date objects as ISO strings over JSON. The actual runtime type is `string | null`, not `Date | null`. The `as` assertion masks this. Current code wraps dates in `new Date()` at usage sites (lines 147, 150), but any future code calling `ticket.dueDate!.toLocaleDateString()` directly would compile cleanly but crash at runtime. Confirmed.

---

### Finding 5: `formatRelativeDate` shows negative day strings for overdue items — CONFIRMED (with correction)

**Original**: Past dates produce "-N days" strings; report claims -3 falls through to formatted date.
**Verification**: Source code at `dashboard.tsx:44-55` confirms the core issue:

```ts
function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `${diffDays} days`;     // catches ALL negatives
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ${diffDays % 7}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

**Correction to original report**: The original claims that `-3` falls through to the formatted date line. This is incorrect. Since `-3 < 7` is `true`, the condition `if (diffDays < 7)` catches ALL negative values. Every past date shows "-N days" — not just `-2`. The fallthrough to `toLocaleDateString` never happens for negative `diffDays`. This makes the bug worse than originally described, not better.

Confirmed: Overdue deadlines display confusing "-N days" text for all negative values.

---

## Summary

| # | Verdict  | Severity | File | Issue |
|---|----------|----------|------|-------|
| 1 | CONFIRMED | CRITICAL | `create.tsx`, `index.tsx` (projects & tickets) | Empty-string dates cause API validation failure on every create |
| 2 | CONFIRMED | HIGH | `$projectId.tsx`, `$ticketId.tsx` | Destructive delete with no confirmation guard |
| 3 | CONFIRMED | HIGH | `ai-chat.tsx` | `.parse()` can crash the component on unexpected API data |
| 4 | CONFIRMED | MEDIUM | `$ticketId.tsx` | Unsafe `as` cast masks string/Date type mismatch |
| 5 | CONFIRMED* | MEDIUM | `dashboard.tsx` | Negative-day display for overdue deadlines (worse than reported) |

*Finding 5 confirmed with correction: ALL negative diffDays values produce "-N days", not just -2.

**Result: 5 CONFIRMED, 0 DISMISSED**
