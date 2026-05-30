# Code Review Report — Cluster 1

**Reviewer**: Code Review Expert
**Date**: 2026-05-30
**Scope**: Security (auth middleware), data flow (context propagation), architecture

## Files Reviewed

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 1 | `packages/api/src/index.ts` | 24 | tRPC initialization, procedure definitions, auth middleware |
| 2 | `packages/api/src/context.ts` | 9 | Request context creation via auth resolution |
| 3 | `packages/api/src/storage.ts` | 21 | Storage backend singleton factory |
| 4 | `packages/api/src/routers/index.ts` | 55 | Root router aggregation |

## Supporting Files Read (for context)

- `packages/auth/src/resolve-auth.ts` — Auth resolution logic (session + API key)
- `packages/auth/src/api-key.ts` — API key generation and hashing
- `packages/auth/src/types.ts` — UserRecord type
- `packages/auth/src/index.ts` — Better Auth config and exports
- `packages/storage/src/index.ts`, `storage.ts`, `local.ts`, `s3.ts`, `types.ts` — Full storage layer
- `packages/env/src/server.ts` — Server-side env validation
- `packages/db/src/schema/automation.ts` — API keys table schema

---

## Findings: 0

**No actionable issues found in the four assigned files.**

---

## Analysis Summary

### `packages/api/src/index.ts` — Auth Middleware

The `protectedProcedure` middleware is correctly implemented:

1. **Null guard** throws `UNAUTHORIZED` before any downstream logic runs when `ctx.user` is absent.
2. **Context narrowing** via `{ ...ctx, user: ctx.user }` is the canonical tRPC pattern. After the null check, TypeScript narrows `ctx.user` to `UserRecord` (non-nullable), and the spread creates a new derived context with the narrowed type. This ensures downstream procedures receive a guaranteed-non-null `user`.
3. The `publicProcedure` is an unmodified `t.procedure` — intentionally unauthenticated. Used only for `healthCheck` in the router.

No auth bypass, no type-safety gaps, no missing error handling.

### `packages/api/src/context.ts` — Context Creation

Clean delegation to `resolveAuth()` from `@DCRM/auth`. The function signature `({ req }: { req: Request })` matches tRPC's expected context factory shape. The return type `Promise<Context>` correctly matches `AuthResult`, which has `user: UserRecord | null` — the nullable field that the middleware later narrows.

If `resolveAuth` throws (e.g., DB connection failure), the error propagates to tRPC's error handler, which returns a 500. This is correct — there is no reason to suppress or transform auth-resolution errors at this layer.

### `packages/api/src/storage.ts` — Storage Singleton

Module-level lazy singleton pattern:

1. **Thread safety**: Not a concern — Node.js is single-threaded. No race between the null check and the assignment.
2. **Env validation**: The `@DCRM/env/server` package has a `createFinalSchema` refine that enforces S3 credentials when `STORAGE_TYPE === "s3"`. This validation runs at import time, before `getStorageBackend()` can be called. So by the time `createStorage()` executes, the required config is guaranteed present.
3. **Error propagation**: If `createStorage()` throws (e.g., S3 SDK not installed), the error reaches the caller, and `cachedBackend` remains `null`. Subsequent calls retry the initialization — no permanent broken state.
4. **No stale-cache problem**: Server restarts are the standard mechanism for picking up env changes. This is expected behavior.

### `packages/api/src/routers/index.ts` — Router Aggregation

Standard tRPC router merging of 20 sub-routers plus two inline procedures:

- `healthCheck` (public): Returns `"OK"`. No information leakage, no amplification risk.
- `privateData` (protected): Returns the authenticated user's own record (id, name, email, etc.). This is equivalent to a standard `/me` endpoint. Since it's behind `protectedProcedure` and only exposes the caller's own data, there is no security issue. It appears to be a dev/test convenience endpoint.
- All sub-routers are merged at the top level without namespace collision — each occupies a unique key.

### Auth Flow Integrity (cross-file)

The full auth chain was traced:

1. Request arrives → `createContext()` calls `resolveAuth(headers, auth.api)`
2. `resolveAuth` tries API key (`dcrm_` Bearer token) first, then falls back to Better Auth session cookie
3. API key path: hashes the raw key with SHA-256, looks up in `apiKeys` table by `keyHash` (unique index), then fetches the user. No timing side-channel — comparison happens in the database, not in application code.
4. Session path: delegates to Better Auth's `getSession()`, maps the generic `Record<string, unknown>` to `UserRecord` with field-level extraction.
5. Both paths return `AuthResult = { user: UserRecord | null, session: ... | null }`
6. `protectedProcedure` middleware rejects `user === null`, narrows to non-null for downstream use
7. All data is scoped by `userId` in the database (foreign keys with `onDelete: "cascade"`)

The chain has no gaps: unauthenticated requests are blocked at the middleware, and authenticated requests carry a verified `UserRecord`.
