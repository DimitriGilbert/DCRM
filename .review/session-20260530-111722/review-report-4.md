# Code Review Report — Clusters 4 & 5

**Reviewer**: Automated Code Review (Domain Package)
**Date**: 2026-05-30
**Scope**: `packages/domain/src/*.ts` (11 source files) + `packages/domain/__tests__/*.test.ts` (11 test files)
**Build**: TypeScript strict mode — passes `tsc --noEmit` cleanly
**Tests**: 54/54 passing

---

## Summary

The domain package is a well-structured enum/constant module with a consistent pattern: `as const` object → derived types → `VALUES` array → `z.enum()` schema. Every file follows this pattern faithfully. The barrel `index.ts` re-exports everything correctly. All 54 tests cover positive validation, negative rejection, and VALUES array ordering.

I found **3 real issues**: one architectural consistency gap in the codebase, and two discrepancies between the domain enums and the explicit PRD v2 data model specifications.

---

### [SEVERITY: MEDIUM] Finding 1: Exchange direction enum is not defined in domain — breaks established single-source pattern

**File**: `packages/db/src/schema/crm.ts:68-71`
**Problem**: Every enum used in the database is defined in `@DCRM/domain` and imported into the DB schema — except exchange direction. The `exchangeDirectionEnum` is hardcoded inline as `["incoming", "outgoing"]` in the DB schema file. This means there is no Zod schema, no TypeScript type constants, and no validation layer for exchange direction values, unlike every other enum in the system.

**Evidence**:
```ts
// packages/db/src/schema/crm.ts:68-71 — hardcoded, not imported from @DCRM/domain
export const exchangeDirectionEnum = pgEnum(
  "exchange_direction",
  ["incoming", "outgoing"],
);
```

Compare with every other enum in the same file:
```ts
// All others follow the pattern: domain → import → pgEnumValues()
import { EXCHANGE_TYPE_VALUES, LEAD_STAGE_VALUES, ... } from "@DCRM/domain";

export const leadStageEnum = pgEnum("lead_stage", pgEnumValues(LEAD_STAGE_VALUES));
export const exchangeTypeEnum = pgEnum("exchange_type", pgEnumValues(EXCHANGE_TYPE_VALUES));
```

**Impact**: API-layer validation (tRPC inputs, form schemas) cannot reference a canonical exchange direction type from `@DCRM/domain`. If direction values ever change, only the DB migration would catch it — the domain layer would be out of sync. This also means the barrel export in `index.ts` has no exchange direction entry, making the domain package's enum coverage incomplete.

**Suggestion**: Add `packages/domain/src/exchange-direction.ts` (or add a direction section to `exchange.ts`) following the established pattern:

```ts
// packages/domain/src/exchange.ts — add alongside existing EXCHANGE_TYPES
export const EXCHANGE_DIRECTIONS = {
  INCOMING: "incoming",
  OUTGOING: "outgoing",
} as const;

export type ExchangeDirectionKey = keyof typeof EXCHANGE_DIRECTIONS;
export type ExchangeDirection = (typeof EXCHANGE_DIRECTIONS)[ExchangeDirectionKey];

export const EXCHANGE_DIRECTION_VALUES: readonly ExchangeDirection[] =
  Object.values(EXCHANGE_DIRECTIONS);

export const exchangeDirectionSchema = z.enum([
  EXCHANGE_DIRECTIONS.INCOMING,
  EXCHANGE_DIRECTIONS.OUTGOING,
]);
```

Then update `crm.ts` to import `EXCHANGE_DIRECTION_VALUES` from `@DCRM/domain` and use `pgEnumValues()` like all other enums.

---

### [SEVERITY: MEDIUM] Finding 2: Ticket status values diverge from PRD v2 data model — missing "waiting" status, "open" vs "new"

**File**: `packages/domain/src/ticket.ts:28-47`
**Problem**: PRD v2 explicitly specifies ticket statuses as: **New, In Progress, Waiting, Resolved, Closed** (5 values). The domain package defines: `open, in_progress, resolved, closed` (4 values). Two discrepancies: (1) the "waiting" status is absent entirely, and (2) the initial status is "open" instead of "new".

**Evidence**:
```ts
// packages/domain/src/ticket.ts:28-33
export const TICKET_STATUSES = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;
```

PRD v2 user story 31:
> "I want to set ticket statuses (New, In Progress, Waiting, Resolved, Closed), so that the workflow matches my process"

PRD v2 data model (line 251):
> `status (enum: New/In Progress/Waiting/Resolved/Closed)`

The DB default at `packages/db/src/schema/crm.ts:193` compounds this:
```ts
status: ticketStatusEnum("status").notNull().default("open"),
```

**Impact**: Tickets lack a "waiting" state for external-dependency scenarios (e.g., waiting on client response), which is a standard support workflow stage. The "open" vs "new" naming difference could cause confusion when comparing API responses to PRD specifications. If external integrations or documentation reference the PRD enum values, they won't match.

**Suggestion**: If "waiting" was intentionally dropped in the v3 refinement, document this decision. Otherwise, add it:

```ts
export const TICKET_STATUSES = {
  NEW: "new",           // align with PRD "New"
  IN_PROGRESS: "in_progress",
  WAITING: "waiting",   // restore PRD "Waiting"
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;
```

This also requires a DB migration to rename `"open"` → `"new"` and add `"waiting"` to the `ticket_status` pgEnum.

---

### [SEVERITY: MEDIUM] Finding 3: Ticket priority uses "urgent" instead of PRD v2's "critical"

**File**: `packages/domain/src/ticket.ts:51-56`
**Problem**: PRD v2 explicitly defines ticket priorities as `low/medium/high/critical`. The domain package uses `low/medium/high/urgent`. The highest-priority value name differs.

**Evidence**:
```ts
// packages/domain/src/ticket.ts:51-56
export const TICKET_PRIORITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",    // PRD v2 says "critical"
} as const;
```

PRD v2 user story 32:
> "I want to set priority on tickets (low, medium, high, critical), so that I can triage effectively"

PRD v2 data model (line 251):
> `priority (enum: low/medium/high/critical)`

**Impact**: The DB stores `"urgent"` as the max priority. Any API consumer, import pipeline, or migration script built against the PRD specification will expect `"critical"` and fail to match. The DB default is `"medium"` so existing data is unaffected, but the semantic mismatch with the PRD creates confusion.

**Suggestion**: Either rename to `"critical"` to match the PRD, or if `"urgent"` was an intentional refinement for v3, document this divergence so that future developers and integration authors aren't surprised.

---

## Items Reviewed With No Issues Found

The following were thoroughly examined and are correct:

- **`packages/domain/src/lead.ts`**: 7 stages with proper `as const`, Zod schema, and VALUES array. The "negotiation" stage is a reasonable pipeline refinement over PRD v2's 6 stages and PRD v3 doesn't contradict.
- **`packages/domain/src/project.ts`**: 5 statuses matching PRD v2 data model exactly.
- **`packages/domain/src/custom-field.ts`**: 7 types matching PRD's "6-7 types: text, number, date, select, checkbox, textarea, url".
- **`packages/domain/src/billing.ts`**: 5 statuses appropriate for Stripe subscription lifecycle.
- **`packages/domain/src/attachment.ts`**: Entity types match PRD's "polymorphic: client/lead/project/ticket/exchange".
- **`packages/domain/src/webhook.ts`**: Outgoing auth modes (bearer/basic/hmac/custom_headers) match PRD v3 section on outgoing webhooks. Incoming modes (test/live) match PRD v3's test-mode-first behavior.
- **`packages/domain/src/ai.ts`**: 4 providers (openrouter/openai/anthropic/google) match PRD v3's provider table.
- **`packages/domain/src/hook.ts`**: Hook types (ai/outgoing_webhook/built_in), write behaviors (propose_first/direct_write), and execution statuses (pending/running/success/failed) all match PRD v3 sections 321, 323, and 313.
- **`packages/domain/src/event.ts`**: 6 sources (app/email/webhook/api/hook/system) match PRD v3's event source type definition.
- **`packages/domain/src/index.ts`**: Barrel exports all symbols correctly with proper `export type` for type-only exports.
- **All 11 test files**: Tests correctly validate enum membership, schema parsing/rejection, and VALUES array contents. Dynamic `await import()` pattern is appropriate for unit test isolation.

---

## Findings Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | MEDIUM | `db/src/schema/crm.ts` | Exchange direction enum hardcoded in DB, not in domain package |
| 2 | MEDIUM | `domain/src/ticket.ts` | Missing "waiting" status, "open" vs PRD's "new" |
| 3 | MEDIUM | `domain/src/ticket.ts` | "urgent" vs PRD's "critical" for highest priority |

**Total findings: 3**
