# Verified Code Review Report — Clusters 4 & 5: Domain Package

**Original Report**: `review-report-4.md`
**Verifier**: Verification Agent
**Date**: 2026-05-30

---

### Finding 1: Exchange direction enum is not defined in domain — breaks established single-source pattern — CONFIRMED

**Original**: The `exchangeDirectionEnum` is hardcoded inline in the DB schema file instead of being defined in `@DCRM/domain` like every other enum.

**Verification/Reason**: CONFIRMED by source code.

- `crm.ts:68-71`:
  ```ts
  export const exchangeDirectionEnum = pgEnum(
    "exchange_direction",
    ["incoming", "outgoing"],
  );
  ```
- Lines 19-26 import enum values from `@DCRM/domain`:
  ```ts
  import {
    EXCHANGE_TYPE_VALUES, LEAD_STAGE_VALUES, PROJECT_STATUS_VALUES,
    TICKET_PRIORITY_VALUES, TICKET_STATUS_VALUES, TICKET_TYPE_VALUES,
  } from "@DCRM/domain";
  ```
- Every other enum in `crm.ts` uses the `pgEnumValues()` helper with imported values (lines 38-66). Only `exchangeDirectionEnum` breaks the pattern.
- Additionally, PRD v2 (`prd.v2.md:252`) specifies exchange direction as `"inbound/outbound/na"` (3 values), while the code has `"incoming/outgoing"` (2 values) — a further discrepancy the original report did not mention.

**Severity upheld**: MEDIUM. The architectural inconsistency is real, and there's no Zod schema or TypeScript type constants for exchange direction values.

---

### Finding 2: Ticket status values diverge from PRD v2 — missing "waiting" status, "open" vs "new" — CONFIRMED

**Original**: PRD v2 specifies 5 ticket statuses (New, In Progress, Waiting, Resolved, Closed) but the domain package defines only 4 (open, in_progress, resolved, closed).

**Verification/Reason**: CONFIRMED by source code, with a nuance about PRD v3.

- `ticket.ts:28-33`:
  ```ts
  export const TICKET_STATUSES = {
    OPEN: "open",
    IN_PROGRESS: "in_progress",
    RESOLVED: "resolved",
    CLOSED: "closed",
  } as const;
  ```
- PRD v2 line 97: *"As a user, I want to set ticket statuses (New, In Progress, Waiting, Resolved, Closed)"*
- PRD v2 line 251: *"status (enum: New/In Progress/Waiting/Resolved/Closed)"*
- `crm.ts:193` confirms: `status: ticketStatusEnum("status").notNull().default("open")`
- Two discrepancies confirmed: (1) "waiting" status absent, (2) "open" instead of "new".
- **Nuance**: PRD v3 (`prd.v3.md:96`) is less specific: *"As a user, I want fixed ticket statuses, so that work moves through a predictable flow"* — it does not enumerate specific values. The code may be an intentional refinement for v3 that simplified the statuses, but this divergence from v2 is undocumented.

**Severity upheld**: MEDIUM. The divergence from PRD v2 is factual. Whether this was an intentional v3 decision or an oversight needs clarification, but the missing "waiting" status is a real workflow gap for ticket management.

---

### Finding 3: Ticket priority uses "urgent" instead of PRD v2's "critical" — CONFIRMED

**Original**: PRD v2 defines priority as `low/medium/high/critical` but the domain package uses `low/medium/high/urgent`.

**Verification/Reason**: CONFIRMED by source code, with a nuance about PRD v3.

- `ticket.ts:51-56`:
  ```ts
  export const TICKET_PRIORITIES = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
    URGENT: "urgent",
  } as const;
  ```
- PRD v2 line 98: *"As a user, I want to set priority on tickets (low, medium, high, critical)"*
- PRD v2 line 251: *"priority (enum: low/medium/high/critical)"*
- **Nuance**: PRD v3 (`prd.v3.md:97`) says *"As a user, I want ticket priorities, so that urgent work is visible"* — the use of the word "urgent" in the user story text may indicate the rename was intentional for v3. The values are semantically equivalent (highest priority level), just named differently.
- The code is self-consistent: the domain package, DB schema, and all consumers use `"urgent"` uniformly.

**Severity upheld (with lowered concern)**: MEDIUM. The divergence from PRD v2 is factual, but PRD v3's use of "urgent" in user story 34 suggests this may have been an intentional rename. The practical impact is lower than originally stated — it's a naming difference, not a missing capability. Documentation of this decision would still be valuable.

---

## Verification Summary

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Exchange direction enum hardcoded in DB, not in domain package | **CONFIRMED** |
| 2 | Missing "waiting" status, "open" vs PRD's "new" | **CONFIRMED** (PRD v2 divergence; PRD v3 is less specific) |
| 3 | "urgent" vs PRD's "critical" for highest priority | **CONFIRMED** (PRD v2 divergence; PRD v3 uses "urgent" wording suggesting intentional rename) |

**Confirmed: 3 / Dismissed: 0**
