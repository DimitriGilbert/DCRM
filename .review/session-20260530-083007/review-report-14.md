# Code Review Report — Cluster 14: API Core

**Reviewer**: Code Review Expert (Cluster 14)
**Date**: 2026-05-30
**Files Reviewed**:
1. `packages/api/src/index.ts` (tRPC init, procedures)
2. `packages/api/src/context.ts` (context creation)
3. `packages/api/src/routers/index.ts` (master router composition)

**Scope**: Security — context creation correctness, auth bypass in protectedProcedure, router composition completeness, type safety of AppRouter export.

---

## Summary

**No real issues found.** These three files are well-structured, follow standard tRPC patterns correctly, and have no security vulnerabilities, logic errors, or data integrity problems.

---

## Detailed Analysis

### `packages/api/src/index.ts` — tRPC Initialization

- `initTRPC.context<Context>().create()` — correct generic parameterization with the `Context` type.
- `publicProcedure = t.procedure` — standard passthrough, no middleware.
- `protectedProcedure` middleware:
  - Checks `!ctx.user` and throws `TRPCError` with `UNAUTHORIZED` — semantically correct (401 = not authenticated).
  - Calls `next()` with narrowed context `{ ...ctx, user: ctx.user }` — this is the canonical tRPC pattern for type-narrowing within the middleware chain. After the `if (!ctx.user)` guard, `ctx.user` is guaranteed non-null, and spreading into the next context correctly overrides the `user: UserRecord | null` with `user: UserRecord`.
  - No auth bypass possible: the guard runs before `next()`, and there's no code path that skips the check.

### `packages/api/src/context.ts` — Context Creation

- `createContext` receives `{ req: Request }` (matching the tRPC adapter contract) and delegates entirely to `resolveAuth(req.headers, auth.api)`.
- `resolveAuth` (in `packages/auth`) implements a two-step resolution:
  1. API key via `Authorization: Bearer dcrm_...` header — format-validated, SHA-256 hashed, DB lookup.
  2. Better Auth session via cookies — delegates to `auth.api.getSession`.
- Returns `{ user: null, session: null }` for unauthenticated requests — no crash path, no undefined leaks.

### `packages/api/src/routers/index.ts` — Master Router

- All 20 sub-routers are imported and composed into `appRouter`:
  `aiChat`, `aiProvider`, `attachment`, `billing`, `client`, `emailAccount`, `entityTag`, `exchange`, `export`, `hook`, `import`, `incomingWebhook`, `lead`, `notification`, `project`, `search`, `settings`, `tag`, `ticket`, `webhook`.
- Verified against filesystem: exactly 20 router directories exist, and all 20 are wired.
- `healthCheck: publicProcedure` — returns `"OK"`, no sensitive data, appropriate as public.
- `privateData: protectedProcedure` — returns user's own data to the authenticated caller, appropriate.
- `AppRouter = typeof appRouter` — correct type export for client-side type inference.
- Naming collision check: no two routers share the same key in the router object.

---

## Verdict

The API core is clean. Auth resolution is sound, procedure guards are correct, router composition is complete, and type safety is properly maintained throughout the chain.
