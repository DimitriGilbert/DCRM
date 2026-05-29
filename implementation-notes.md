# Implementation Notes

Phase 0 repository and architecture audit baseline for the DCRM orchestration workflow.

## Current Package And App Layout

The repository is a pnpm v10.33.4 workspace with Turborepo. Workspace packages are declared as `apps/*` and `packages/*`.

Apps:

- `apps/web`: TanStack Start, React 19, Vite, tRPC client, Better Auth React client, Tailwind CSS v4, shared `@DCRM/ui` components. Entry points include `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/dashboard.tsx`, `src/routes/login.tsx`, API route handlers under `src/routes/api/auth/$.ts` and `src/routes/api/trpc/$.ts`.
- `apps/native`: Expo Router app with Uniwind, HeroUI Native, Better Auth Expo client, React Query, and tRPC client setup. Entry points include `app/_layout.tsx`, drawer and tab routes under `app/(drawer)`, auth components under `components/sign-in.tsx` and `components/sign-up.tsx`, and client setup in `lib/auth-client.ts` and `utils/trpc.ts`.
- `apps/desktop`: Electrobun desktop shell. `electrobun.config.ts` copies `../web/dist/client` into `views/mainview`; `src/bun/index.ts` opens the packaged web app and optionally uses a web dev server in Electrobun dev channel.

Packages:

- `packages/api`: tRPC primitives, context creation, and the current root router.
- `packages/auth`: Better Auth configuration using the Drizzle adapter and Expo/TanStack Start plugins.
- `packages/db`: Drizzle PostgreSQL connection, schema exports, auth schema, Drizzle config, and a local PostgreSQL Docker Compose file.
- `packages/env`: typed environment schemas for server, web, and native runtime environments.
- `packages/ui`: shared shadcn/base-lyra UI primitives, Tailwind globals, and utility helpers.
- `packages/config`: shared TypeScript base config.

## Available Scripts And Validation Commands

Root scripts:

- `pnpm dev`: `turbo dev`.
- `pnpm build`: `turbo build`.
- `pnpm check-types`: `turbo check-types`.
- `pnpm dev:native`: `turbo -F native dev`.
- `pnpm dev:web`: `turbo -F web dev`.
- `pnpm dev:desktop`: `turbo -F desktop dev:hmr`.
- `pnpm build:desktop`: `turbo -F desktop build:stable`.
- `pnpm build:desktop:canary`: `turbo -F desktop build:canary`.
- Database commands: `pnpm db:push`, `pnpm db:studio`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:start`, `pnpm db:watch`, `pnpm db:stop`, `pnpm db:down`.

Package scripts:

- `apps/web`: `build`, `serve`, `dev`; no package-level `check-types` script is currently defined.
- `apps/native`: `start`, `dev`, `android`, `ios`, `prebuild`, `web`; no package-level `check-types` script is currently defined.
- `apps/desktop`: `start`, `dev`, `dev:hmr`, `hmr`, `build`, `build:stable`, `build:canary`, `check-types`.
- `packages/ui`: `check-types`.
- `packages/db`: Drizzle and local PostgreSQL Docker Compose commands listed above.
- `packages/api`, `packages/auth`, and `packages/env`: no scripts currently defined.

Turborepo defines `build`, `lint`, `check-types`, `dev`, and database tasks. The `check-types` task depends on upstream `check-types` tasks but only packages/apps with a matching script participate.

Primary gatekeeping command for this phase: `pnpm check-types`. Dev server commands must not be run during orchestration.

## Existing Auth And Session Patterns

Server auth:

- `packages/auth/src/index.ts` exports `createAuth()` and singleton `auth`.
- Better Auth is configured with `drizzleAdapter(createDb(), { provider: "pg", schema })`.
- Email/password auth is enabled.
- Better Auth secret and base URL come from `env.BETTER_AUTH_SECRET` and `env.BETTER_AUTH_URL`.
- Trusted origins include `env.CORS_ORIGIN`, `DCRM://`, `exp://`, and `http://localhost:8081`.
- Plugins are `tanstackStartCookies()` and `expo()`.

Web auth:

- `apps/web/src/routes/api/auth/$.ts` forwards GET and POST requests to `auth.handler(request)`.
- `apps/web/src/lib/auth-client.ts` uses `createAuthClient({})`.
- `apps/web/src/functions/get-user.ts` is used by the dashboard route to fetch the current session server-side.
- `apps/web/src/routes/dashboard.tsx` redirects unauthenticated users to `/login` during route loading.
- `apps/web/src/middleware/auth.ts` creates a TanStack Start middleware that resolves `auth.api.getSession({ headers })` and adds `session` to context.
- Login and signup UI is currently Better Auth-owned auth flow UI using TanStack React Form directly, which is allowed by the PRD exception for auth-managed forms.

Native auth:

- `apps/native/lib/auth-client.ts` uses Better Auth React client with the Expo client plugin.
- Native auth stores session data through `expo-secure-store` with a scheme-derived prefix.
- `apps/native/utils/trpc.ts` manually forwards Better Auth cookies for native requests and uses `credentials: "include"` on web.

API session context:

- `packages/api/src/context.ts` calls `auth.api.getSession({ headers: req.headers })` and returns `{ auth: null, session }`.
- `packages/api/src/index.ts` defines `protectedProcedure` as a tRPC middleware requiring `ctx.session`.
- No API-key authentication exists yet.

## Existing DB Schema And Migration Setup

Database connection:

- `packages/db/src/index.ts` exports `createDb()` and singleton `db` using `drizzle(env.DATABASE_URL, { schema })` from `drizzle-orm/node-postgres`.
- Server env currently requires `DATABASE_URL`.

Current schema:

- `packages/db/src/schema/index.ts` re-exports `./auth`.
- `packages/db/src/schema/auth.ts` defines Better Auth tables: `user`, `session`, `account`, and `verification`.
- `user` includes `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, and `updatedAt`.
- `session` includes `id`, `expiresAt`, `token`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, and `userId`; `userId` cascades to `user.id` and is indexed.
- `account` includes provider identifiers, `userId`, tokens, `password`, and timestamps; `userId` cascades to `user.id` and is indexed.
- `verification` includes `identifier`, `value`, `expiresAt`, and timestamps; `identifier` is indexed.
- Relations are defined for user sessions/accounts and session/account to user.

Migration and database tooling:

- `packages/db/drizzle.config.ts` points to schema `./src/schema`, output `./src/migrations`, dialect `postgresql`, and loads env from `../../apps/web/.env`.
- No generated migration files currently exist under `packages/db/src/migrations`.
- `packages/db/docker-compose.yml` provides a PostgreSQL service only; Redis is not present yet.

## Existing tRPC Router And Procedure Patterns

- `packages/api/src/index.ts` creates `t` via `initTRPC.context<Context>().create()`.
- `router` is exported as `t.router`.
- `publicProcedure` is exported as `t.procedure`.
- `protectedProcedure` uses middleware to throw `TRPCError({ code: "UNAUTHORIZED", message: "Authentication required", cause: "No session" })` when `ctx.session` is missing, then narrows context with a non-null session.
- `packages/api/src/routers/index.ts` currently defines one root router with `healthCheck` public query and `privateData` protected query.
- `apps/web/src/routes/api/trpc/$.ts` adapts `appRouter` through `fetchRequestHandler` at `/api/trpc` with GET and POST handlers.
- `apps/web/src/router.tsx` creates a tRPC client with `httpBatchLink({ url: "/api/trpc" })` and `credentials: "include"`.
- `apps/native/utils/trpc.ts` creates a tRPC client targeting `${env.EXPO_PUBLIC_SERVER_URL}/api/trpc`.
- There is no domain router split yet and no one-query/mutation-per-file procedure organization yet.

## Existing UI, shadcn, And Formedible Setup

Shared UI:

- `packages/ui/components.json` uses shadcn style `base-lyra`, Tailwind CSS variables, lucide icons, and aliases under `@DCRM/ui/*`.
- `apps/web/components.json` points web shadcn generation at shared UI CSS and aliases `ui` to `@DCRM/ui/components`.
- Shared primitives currently include `button`, `input`, `label`, `card`, `checkbox`, `dropdown-menu`, `skeleton`, and `sonner`.
- UI components use named exports, `data-slot`, Base UI primitives where applicable, CVA, and `cn()` from `packages/ui/src/lib/utils.ts`.
- Styling uses Tailwind CSS v4 globals from `packages/ui/src/styles/globals.css`, imported into `apps/web/src/index.css`.

Forms:

- The repository currently has `@tanstack/react-form` installed in web and native packages.
- Current web login/signup and native sign-in/sign-up forms use TanStack React Form directly. These are auth forms and fall under the PRD's Better Auth auth-flow exception.
- No Formedible package, Formedible component, or shared Formedible integration layer is currently present.
- No CRM create/edit/configuration forms exist yet.

## Known Gaps Before Implementation

- Core CRM schema is absent: clients, leads, projects, tickets, exchanges, attachments, tags, custom fields, events, hooks, AI providers, email accounts, API keys, billing, notifications, and settings are not modeled yet.
- Generated Drizzle migrations are absent.
- Redis and BullMQ are not configured; the existing Docker Compose file only starts PostgreSQL.
- Environment schema lacks Redis, encryption key, storage, Stripe, hosted billing switch, app URL, webhook base URL, and integration-specific settings.
- API key auth is absent; tRPC protected procedures currently accept only Better Auth sessions.
- tRPC router currently contains only health check and sample private data queries.
- Event engine, hook execution, loop suppression, incoming webhook mapping, outgoing webhooks, AI module, email module, storage module, billing module, i18n module, and crypto module are absent.
- Formedible integration is absent despite being required for future app create/edit/configuration forms.
- Web dashboard is a minimal authenticated placeholder and does not implement PRD dashboard metrics.
- Native app is scaffold/navigation/auth-oriented and does not implement CRM browsing or editing.
- Desktop app is a thin Electrobun wrapper and currently logs development/runtime status from the Bun entrypoint.
- No repository-wide test runner is configured.
- `pnpm check-types` currently only runs workspace tasks that define a `check-types` script, so several packages/apps are not covered by that command until scripts are added.
- No Vercel AI SDK or `ai` package dependency is present in current package manifests.
- No organization/team/collaboration product model is present in current domain code.

## Phase 0 Scope Statement

This phase is documentation-only. No product features, schemas, routers, UI flows, or runtime behavior were implemented in Phase 0.

## Phase 0 Gatekeeping Result

- `pnpm check-types` was run from the repository root.
- Result: failed in the pre-existing `desktop#check-types` task.
- Exact failure: `../../node_modules/.pnpm/electrobun@1.18.1/node_modules/electrobun/dist/api/bun/index.ts(32,24): error TS7016: Could not find a declaration file for module 'three'. '/home/didi/workspace/Code/DCRM/node_modules/.pnpm/three@0.165.0/node_modules/three/build/three.module.js' implicitly has an 'any' type.`
- Phase 0 did not modify product code to address this because the failure is unrelated to the documentation-only audit.
