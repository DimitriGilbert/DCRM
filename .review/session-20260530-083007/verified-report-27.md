# Verified Report — Cluster 27: Outgoing Webhooks

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Source**: review-report-27.md
**Result**: 5 CONFIRMED / 0 DISMISSED (1 severity adjusted)

---

## Finding 1: No URL Validation — SSRF Vulnerability

**Verdict**: ✅ CONFIRMED — Severity: HIGH (adjusted from CRITICAL)

**Evidence**: 
- `schemas.ts` line 8: `url: z.string().min(1).max(2048)` — no `z.string().url()`, no scheme check, no SSRF blocklist.
- `schemas.ts` line 49: `url: z.string().min(1).max(2048).optional()` — same in update schema.
- Verified that `packages/webhooks/src/outgoing.ts` line 40: `const response = await globalThis.fetch(url, init)` — the delivery engine DOES make real HTTP requests to stored URLs. The SSRF vector is real.

**Severity Adjustment**: CRITICAL → HIGH. The report rates this CRITICAL, which is appropriate for multi-tenant systems. However, AGENTS.md states this is a single-user CRM ("Single-user CRM only"). The only person setting webhook URLs is the user themselves, who already has full access to the system. The SSRF risk is the user attacking their own infrastructure, which reduces the practical threat. That said, two real issues remain:
1. **No URL format validation**: Malformed URLs (typos, non-HTTP schemes) are stored silently and fail only at delivery time with no useful error message.
2. **Defense-in-depth**: If the product ever becomes multi-tenant, this becomes a critical SSRF vulnerability retroactively.

The missing `z.string().url()` format check alone justifies HIGH.

---

## Finding 2: Missing `type` filter in update allows mutating non-webhook hooks

**Verdict**: ✅ CONFIRMED — Severity: HIGH

**Evidence**: 
- `update.ts` lines 15–23: The SELECT queries by `id` + `userId` only — no `eq(hooks.type, "outgoing_webhook")`.
- Verified `packages/domain/src/hook.ts` lines 5–9: The `HOOK_TYPES` constant defines three types: `ai`, `outgoing_webhook`, `built_in`. All share the same `hooks` table.
- `create.ts` line 30: Sets `type: "outgoing_webhook"` — only creates outgoing webhooks.
- `list.ts` line 24: Filters by `row.type === "outgoing_webhook"` — only lists outgoing webhooks.
- But `update.ts` has no type guard — a user could overwrite an AI or built-in hook's config by passing its ID.

This is a confirmed data integrity violation. The update at lines 56–64 overwrites the entire `config` JSON with webhook-specific fields (`url`, `auth`, `method`, `headers`, `timeoutMs`, `maxRetries`), destroying the original hook's configuration.

---

## Finding 3: Missing `type` filter in delete allows deleting non-webhook hooks

**Verdict**: ✅ CONFIRMED — Severity: HIGH

**Evidence**: 
- `delete.ts` lines 11–18: The DELETE filters by `id` + `userId` only — no type filter.
- Same class of issue as Finding 2. Any hook owned by the user (AI automations, built-in hooks) can be silently deleted through the webhook API endpoint.

---

## Finding 4: auth-builder.ts bypasses centralized env validation

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `auth-builder.ts` lines 24–26: `const key = process.env["ENCRYPTION_KEY"]; if (!key || key.length < 32) { throw new Error(...) }`
- Verified `packages/env/src/server.ts` line 17: `ENCRYPTION_KEY: z.string().min(32)` — the centralized env package already validates this.
- Grep found 7 files in `packages/api/src/` that correctly import `env` from `@DCRM/env/server`. `auth-builder.ts` is the ONLY file that reads `ENCRYPTION_KEY` directly from `process.env`.
- The inline validation on lines 24–26 duplicates what the env package does at startup. And worse, it fails at runtime (when a webhook with auth is created) rather than at startup.

---

## Finding 5: update.ts returns HTTP 500 for "Not Found"

**Verdict**: ✅ CONFIRMED — Severity: MEDIUM

**Evidence**: 
- `update.ts` line 26: `throw new Error("Webhook not found")` — raw `Error`, not `TRPCError`.
- Verified the correct pattern exists in `packages/api/src/routers/exchange/send-email.ts` line 35: `throw new TRPCError({ code: "NOT_FOUND", message: "Exchange not found" })`.
- tRPC converts raw `Error` to `INTERNAL_SERVER_ERROR` (HTTP 500). The correct response for "resource not found" is `NOT_FOUND` (HTTP 404).

---

## Summary

| # | Finding | Verdict | Severity | Adjusted? |
|---|---------|---------|----------|-----------|
| 1 | No URL validation / SSRF | CONFIRMED | HIGH | ↓ from CRITICAL |
| 2 | Missing type filter in update | CONFIRMED | HIGH | — |
| 3 | Missing type filter in delete | CONFIRMED | HIGH | — |
| 4 | Bypasses env validation | CONFIRMED | MEDIUM | — |
| 5 | Raw Error → HTTP 500 | CONFIRMED | MEDIUM | — |

**False positives**: 0
**Severity adjustments**: 1 (Finding 1 downgraded from CRITICAL to HIGH due to single-user constraint).
