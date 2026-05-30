# Verified Report — Cluster 18: Exchange Router

**Verifier**: Verification Agent
**Original Report**: `review-report-18.md`
**Date**: 2026-05-30

---

### Finding 1: Empty-string entity IDs bypass ownership checks and cause raw DB errors — CONFIRMED

**Original**: The optional entity ID fields (`clientId`, `projectId`, `ticketId`) in `createExchangeSchema` use `z.string().optional()`, which allows empty strings `""` to pass validation. In `create.ts`, the ownership guard checks use truthiness (`if (input.ticketId)`) — empty strings are falsy, so the ownership check is silently skipped. The exchange is then inserted with the empty string, which hits a foreign key violation.

**Verification/Reason**: CONFIRMED by source code.

`exchange/schemas.ts:7-9`:
```typescript
clientId: z.string().optional(),   // allows ""
projectId: z.string().optional(),  // allows ""
ticketId: z.string().optional(),   // allows ""
```

Compare with the established pattern: `exchange/schemas.ts:20-21` uses `z.string().min(1)`, `lead/schemas.ts:42` uses `z.string().min(1)`.

`create.ts:53`:
```typescript
if (input.ticketId) {   // "" is falsy → ownership check skipped
```

Same pattern at lines 70 and 87 for `projectId` and `clientId`.

`create.ts:32-34`:
```typescript
clientId: input.clientId ?? null,   // "" ?? null === ""
projectId: input.projectId ?? null, // "" ?? null === ""
ticketId: input.ticketId ?? null,   // "" ?? null === ""
```

The nullish coalescing operator (`??`) only catches `null` and `undefined`, not empty strings. So `""` passes through to the INSERT, hitting a PostgreSQL FK violation.

The full exploitation chain works as described:
1. Input: `{ type: "comment", ticketId: "", body: "hi", direction: "outgoing" }`
2. Schema validation: passes (empty string is a valid `z.string()`)
3. Ownership check: skipped (`""` is falsy)
4. DB insert: `ticketId: ""` → FK violation → raw 500 error

Severity MEDIUM is appropriate (not HIGH because there's no data exfiltration — just an ungraceful error response).

---

### Finding 2: send-email recipient resolution queries lack userId scoping — CONFIRMED (defense-in-depth)

**Original**: When resolving the recipient email, the ticket, project, and client lookups are queried by ID alone without scoping to `ctx.user.id`.

**Verification/Reason**: CONFIRMED — accurately described as defense-in-depth.

All four entity lookups in `send-email.ts` confirmed without userId:

Line 62 (ticket lookup):
```typescript
.where(eq(tickets.id, exchange.ticketId))  // no userId
```

Line 70 (project lookup):
```typescript
.where(eq(projects.id, ticket.projectId))  // no userId
```

Line 77 (client lookup):
```typescript
.where(eq(clients.id, project.clientId))   // no userId
```

Line 90 (fallback client):
```typescript
.where(eq(clients.id, exchange.clientId))  // no userId
```

Lines 143-148 (threading query):
```typescript
.where(
  and(
    eq(exchanges.ticketId, exchange.ticketId),
    isNotNull(exchanges.metadata),
  ),
)
// no userId filter
```

Compare with `create.ts:58-59` (ticket ownership):
```typescript
and(
  eq(tickets.id, input.ticketId),
  eq(tickets.userId, ctx.user.id),
),
```

And the email account lookup in the SAME file (`send-email.ts:108-111`):
```typescript
and(
  eq(emailAccounts.id, input.emailAccountId),
  eq(emailAccounts.userId, ctx.user.id),
),
```

The report accurately notes this is not exploitable today due to single-user constraints and FK integrity. The inconsistency is real — `create.ts` and the email account lookup both scope by `userId`, but the recipient resolution chain doesn't. Severity MEDIUM is appropriate as defense-in-depth.

---

### Finding 3: No idempotency guard on send-email — duplicate emails on retry — CONFIRMED

**Original**: The `sendExchangeEmail` mutation has no guard against sending the same exchange email twice. There is no check for existing `emailSentAt` or `messageId` before sending.

**Verification/Reason**: CONFIRMED by source code.

The exchange is fetched at `send-email.ts:23-32` with its metadata, but there is no check between lines 44-163 for existing email-sent indicators. The code flow is:

1. Fetch exchange (line 23-32) — metadata available but never checked for `emailSentAt`
2. Guard: isInternal (line 39) ✓
3. Guard: has body (line 47) ✓
4. Resolve recipient (line 54-101)
5. Fetch SMTP credentials (line 103-128)
6. Build threading headers (line 130-155)
7. **Send email (line 163-171) — NO pre-check for existing send**
8. Update metadata with `emailSentAt` and `messageId` (line 173-190)

The metadata update at line 176-177:
```typescript
messageId: result.messageId,
emailSentAt: result.sentAt.toISOString(),
```

This writes the `emailSentAt` field that COULD be used as an idempotency key, but it is never read back for that purpose. A retry or double-click would send a duplicate email with a new `Message-Id`.

Severity MEDIUM is appropriate — this is a reliability/UX issue, not a security vulnerability.

---

## Verification Summary

| Finding | Title                                    | Verdict                      | Severity |
|---------|------------------------------------------|------------------------------|----------|
| 1       | Empty-string entity IDs bypass ownership | CONFIRMED                    | MEDIUM   |
| 2       | send-email recipient queries lack userId (defense-in-depth) | CONFIRMED (defense-in-depth) | MEDIUM   |
| 3       | No idempotency guard on send-email       | CONFIRMED                    | MEDIUM   |

**Total: 3 confirmed, 0 dismissed**
