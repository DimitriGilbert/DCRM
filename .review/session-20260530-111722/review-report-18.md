# Review Report — Cluster 18: Exchange Router

**Reviewer**: Code Review Expert (Automated)
**Date**: 2026-05-30
**Files Reviewed**: 9 files in `packages/api/src/routers/exchange/`

---

### [SEVERITY: MEDIUM] Finding 1: Empty-string entity IDs bypass ownership checks and cause raw DB errors

**File**: `packages/api/src/routers/exchange/schemas.ts:7-9`
**Also in**: `packages/api/src/routers/exchange/create.ts:53-101`

**Problem**: The optional entity ID fields (`clientId`, `projectId`, `ticketId`) in `createExchangeSchema` use `z.string().optional()`, which allows empty strings `""` to pass validation. In `create.ts`, the ownership guard checks use truthiness (`if (input.ticketId)`) — empty strings are falsy, so the ownership check is silently skipped. The exchange is then inserted with `ticketId: ""` (because `"" ?? null` yields `""`), which hits a foreign key violation in PostgreSQL instead of returning a clean validation error.

**Evidence**:
```typescript
// schemas.ts — no .min(1) guard
clientId: z.string().optional(),   // line 7
projectId: z.string().optional(),  // line 8
ticketId: z.string().optional(),   // line 9

// create.ts — truthiness check lets "" through
if (input.ticketId) {              // line 53 — "" is falsy, skipped
  // ownership verification
}

// createExchangeInDb — nullish coalescing doesn't catch ""
ticketId: input.ticketId ?? null,  // line 34 — "" ?? null === ""
```

Compare with the established pattern elsewhere in the codebase (e.g., `ticket/schemas.ts`, `client/schemas.ts`, `project/schemas.ts`), which consistently uses `z.string().min(1)` for entity IDs.

**Impact**: A caller sending `{ type: "comment", ticketId: "", body: "hi", direction: "outgoing" }` bypasses the ticket ownership verification and receives an unhandled Postgres FK violation error (500) instead of a proper tRPC validation error (400). The same applies to `clientId` and `projectId`.

**Suggestion**: Add `.min(1)` to each optional entity ID field in `createExchangeSchema`, consistent with the rest of the codebase:

```typescript
export const createExchangeSchema = z.object({
  type: exchangeTypeSchema,
  clientId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  ticketId: z.string().min(1).optional(),
  // ... rest unchanged
});
```

---

### [SEVERITY: MEDIUM] Finding 2: send-email recipient resolution queries lack userId scoping (defense-in-depth)

**File**: `packages/api/src/routers/exchange/send-email.ts:58-93`

**Problem**: When resolving the recipient email, the ticket, project, and client lookups are queried by ID alone without scoping to `ctx.user.id`. While the exchange itself is user-scoped (line 28-29) and the single-user product constraint makes cross-user data impossible today, this is inconsistent with the ownership-check pattern used in `create.ts` (which always includes `eq(tickets.userId, ctx.user.id)`) and the email account lookup (line 109, which does scope by userId). The threading header query on line 143-148 also lacks userId scoping.

**Evidence**:
```typescript
// send-email.ts line 62 — no userId filter on ticket
const [ticket] = await db
  .select({ id: tickets.id, title: tickets.title, projectId: tickets.projectId })
  .from(tickets)
  .where(eq(tickets.id, exchange.ticketId))  // missing: eq(tickets.userId, ctx.user.id)
  .limit(1);

// line 70 — no userId filter on project
const [project] = await db
  .select({ clientId: projects.clientId })
  .from(projects)
  .where(eq(projects.id, ticket.projectId))  // missing: eq(projects.userId, ctx.user.id)

// line 77 — no userId filter on client
const [client] = await db
  .select({ email: clients.email })
  .from(clients)
  .where(eq(clients.id, project.clientId))   // missing: eq(clients.userId, ctx.user.id)

// line 90 — no userId filter on fallback client
.where(eq(clients.id, exchange.clientId))    // missing: eq(clients.userId, ctx.user.id)

// line 143-148 — threading header query not scoped by user
.where(
  and(
    eq(exchanges.ticketId, exchange.ticketId),
    isNotNull(exchanges.metadata),
  ),
)
// missing: eq(exchanges.userId, ctx.user.id)
```

For comparison, the email account query on line 107-112 correctly uses `eq(emailAccounts.userId, ctx.user.id)`, and `create.ts` always pairs `eq(entity.id, input.id)` with `eq(entity.userId, ctx.user.id)`.

**Impact**: Not exploitable today due to single-user constraint and FK integrity. However, if multi-tenancy is ever introduced, this would allow an attacker who controls an exchange's ticketId (via a future update endpoint or direct DB manipulation) to resolve and exfiltrate another user's client email address. The inconsistent pattern also makes the code harder to audit.

**Suggestion**: Add userId filters to all related-entity lookups in send-email.ts, consistent with create.ts:

```typescript
// Ticket lookup
.where(and(eq(tickets.id, exchange.ticketId), eq(tickets.userId, ctx.user.id)))

// Project lookup
.where(and(eq(projects.id, ticket.projectId), eq(projects.userId, ctx.user.id)))

// Client lookup
.where(and(eq(clients.id, project.clientId), eq(clients.userId, ctx.user.id)))

// Fallback client lookup
.where(and(eq(clients.id, exchange.clientId), eq(clients.userId, ctx.user.id)))

// Threading query
.where(and(
  eq(exchanges.ticketId, exchange.ticketId),
  eq(exchanges.userId, ctx.user.id),
  isNotNull(exchanges.metadata),
))
```

---

### [SEVERITY: MEDIUM] Finding 3: No idempotency guard on send-email — duplicate emails on retry

**File**: `packages/api/src/routers/exchange/send-email.ts:163-190`

**Problem**: The `sendExchangeEmail` mutation has no guard against sending the same exchange email twice. After the email is sent (line 164-171), the metadata is updated (line 183-190). If the DB update fails after the email is already sent, or if the user retries the mutation, the email is sent again. There is no check for existing `emailSentAt` or `messageId` in the exchange metadata before sending.

**Evidence**:
```typescript
// Line 163-171 — email sent immediately, no pre-check
const transport = await createNodemailerTransport(smtpCreds);
const result = await sendPlainEmail(transport, account.email, {
  to: recipientEmail,
  subject,
  body: exchange.body,
  inReplyTo,
  references,
});

// Line 183-190 — metadata update (if this fails, email already sent)
await db
  .update(exchanges)
  .set({
    metadata: updatedMetadata,
    direction: "outgoing",
    updatedAt: new Date(),
  })
  .where(eq(exchanges.id, exchange.id));
```

The `exchange.metadata` may already contain a `messageId` from a previous send, but this is never checked.

**Impact**: On retry (user double-clicks, network timeout with successful send, or DB update failure), the client receives a duplicate email. For a CRM, this looks unprofessional and could confuse clients. The threading headers would also be incorrect for duplicates (each gets its own `Message-Id` but references the same parent).

**Suggestion**: Check for existing `emailSentAt` in metadata before sending, and return the existing result if already sent:

```typescript
// Before step 8, add a guard:
if (exchange.metadata?.emailSentAt) {
  return {
    success: true,
    messageId: (exchange.metadata as Record<string, unknown>).messageId as string,
    sentAt: new Date(exchange.metadata.emailSentAt as string),
  };
}
```

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 3     |
| **Total**| **3** |

**Finding 1** (empty-string IDs bypass ownership) is the most actionable — a one-line schema fix prevents a silent ownership-check bypass and raw DB errors.

**Finding 2** (missing userId scoping in send-email) is a defense-in-depth measure. Not exploitable today but inconsistent with the pattern used in create.ts and the email account lookup in the same file.

**Finding 3** (no idempotency guard on email send) is a reliability issue that can cause duplicate emails to clients.
