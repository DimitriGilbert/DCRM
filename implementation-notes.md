# DCRM Implementation Notes — Phase 0 Audit

## 1. Package/App Layout

### Root Config
- **Package manager**: pnpm 10.33.4 (corepack)
- **Monorepo**: pnpm workspaces + Turborepo 2.9.16
- **Type**: ESM (`"type": "module"`)
- **Catalog** (pnpm-workspace.yaml): dotenv ^17.2.2, zod ^4.1.13, typescript ^6, next-themes, @trpc/server ^11.16.0, @trpc/client ^11.16.0, @trpc/tanstack-react-query ^11.16.0, better-auth 1.6.11, @tanstack/react-form ^1.28.0, @types/react-dom, @better-auth/expo 1.6.11

### Apps

| App | Name | Location | Key Details |
|-----|------|----------|-------------|
| Web | `web` | `apps/web` | TanStack Start (Vite + React 19 + React Router + React Query), tRPC client, Better Auth client, Tailwind CSS v4, @tanstack/react-form |
| Native | `native` | `apps/native` | Expo 56 + expo-router + Uniwind, tRPC client, Better Auth (@better-auth/expo), @tanstack/react-form |
| Desktop | `desktop` | `apps/desktop` | Electrobun 1.15.1 wrapping web build output, Bun entrypoint |

### Packages

| Package | Name | Location | Key Dependencies | Scripts |
|---------|------|----------|-----------------|---------|
| API | `@DCRM/api` | `packages/api` | @DCRM/auth, @DCRM/db, @DCRM/env, @trpc/server, @trpc/client, zod | none |
| Auth | `@DCRM/auth` | `packages/auth` | @DCRM/db, @DCRM/env, better-auth, @better-auth/expo, zod | none |
| DB | `@DCRM/db` | `packages/db` | @DCRM/env, drizzle-orm ^0.45.1, pg ^8.17.1, zod | db:push, db:generate, db:studio, db:migrate, db:start, db:watch, db:stop, db:down |
| UI | `@DCRM/ui` | `packages/ui` | @base-ui/react, CVA, clsx, tailwind-merge, lucide-react, next-themes, sonner, shadcn ^3.6.2, tw-animate-css | check-types |
| Env | `@DCRM/env` | `packages/env` | @t3-oss/env-core ^0.13.1, dotenv, zod | none |
| Config | `@DCRM/config` | `packages/config` | (none) | none |

### Not Yet Created (Required by PRD)
- Event engine package/module
- AI module (TanStack AI adapters)
- Email module (IMAP/SMTP)
- Storage module (local/S3)
- Crypto module
- Billing module (Stripe)
- i18n module

## 2. Available Scripts and Validation Commands

### Root-Level Scripts
```
pnpm dev              # turbo dev (all packages)
pnpm build            # turbo build (all packages)
pnpm check-types      # turbo check-types (all packages)
pnpm dev:web          # turbo -F web dev
pnpm dev:native       # turbo -F native dev
pnpm dev:desktop      # turbo -F desktop dev:hmr
pnpm build:desktop    # turbo -F desktop build:stable
pnpm db:push          # drizzle-kit push
pnpm db:generate      # drizzle-kit generate
pnpm db:migrate       # drizzle-kit migrate
pnpm db:studio        # drizzle-kit studio
pnpm db:start         # docker compose up -d
pnpm db:watch         # docker compose up
pnpm db:stop          # docker compose stop
pnpm db:down          # docker compose down
```

### Package-Level Scripts
- `@DCRM/ui`: `check-types` (tsc --noEmit)
- `@DCRM/db`: db:* scripts (drizzle-kit + docker compose)
- `desktop`: `check-types` (tsc --noEmit), build scripts
- All other packages have no scripts defined

### Test Runner
- **No test runner is configured.** No vitest config, no test files, no test scripts in any package.json.
- AGENTS.md specifies: use vitest with @testing-library/react and jsdom when adding tests.
- Both @testing-library/react and jsdom are already in web devDeps.

## 3. Existing Auth/Session Patterns

### Server-Side (packages/auth)
- **Better Auth** configured in `packages/auth/src/index.ts`
- Uses `betterAuth()` with drizzle adapter (PostgreSQL provider)
- Plugins: `tanstackStartCookies()`, `expo()`
- Email+password auth enabled
- Config: `BETTER_AUTH_SECRET` (min 32 chars), `BETTER_AUTH_URL`, `CORS_ORIGIN`
- Trusted origins: CORS_ORIGIN, "DCRM://", "exp://", "http://localhost:8081"
- Auth handler exposed via `auth.handler(request)` — mounted in web at `/api/auth/$`

### Client-Side (web)
- Auth client: `apps/web/src/lib/auth-client.ts` — `createAuthClient({})` from `better-auth/react`
- Session hook: `authClient.useSession()` used in header/user-menu components
- Sign in: `authClient.signIn.email()` in `sign-in-form.tsx`
- Sign up: `authClient.signUp.email()` in `sign-up-form.tsx`
- Sign out: `authClient.signOut()` in `user-menu.tsx`
- Auth forms use `@tanstack/react-form` (NOT Formedible — correctly, as auth forms are Better Auth owned per PRD)

### Auth Middleware (web)
- `apps/web/src/middleware/auth.ts` — TanStack Start middleware calling `auth.api.getSession()`
- `apps/web/src/functions/get-user.ts` — server function using auth middleware
- Dashboard route (`/dashboard`) uses `beforeLoad` to get session and redirects to `/login` if unauthenticated

### Auth Context (API)
- `packages/api/src/context.ts` — `createContext()` calls `auth.api.getSession()` from request headers
- Returns `{ auth: null, session }` — note: `auth` field is always null (possibly placeholder)
- Session typing: `Context.session` is nullable

## 4. Existing DB Schema and Migration Setup

### Drizzle Config
- `packages/db/drizzle.config.ts` — dialect: postgresql, schema: `./src/schema`, migrations out: `./src/migrations`
- Reads DATABASE_URL from `../../apps/web/.env`

### Docker Compose (packages/db/docker-compose.yml)
- PostgreSQL service: image `postgres`, db `DCRM`, user `postgres`, password `password`
- Port 5432, volume `DCRM_postgres_data`, healthcheck configured

### Current Schema (packages/db/src/schema/)
- **auth.ts**: Better Auth managed tables
  - `user`: id (text PK), name, email (unique), emailVerified, image, createdAt, updatedAt
  - `session`: id (text PK), expiresAt, token (unique), createdAt, updatedAt, ipAddress, userAgent, userId (FK -> user)
  - `account`: id (text PK), accountId, providerId, userId (FK -> user), accessToken, refreshToken, idToken, tokens expiry, scope, password, timestamps
  - `verification`: id (text PK), identifier, value, expiresAt, timestamps
  - Relations: user -> sessions, accounts; session -> user; account -> user
- **index.ts**: re-exports from auth.ts, `export {}` for module side effects

### Migrations
- **No migrations have been generated yet.** The `packages/db/src/migrations/` directory does not exist.
- Schema has only been applied via `db:push` or not at all.

### Database Connection
- `packages/db/src/index.ts` — `createDb()` using `drizzle-orm/node-postgres` with `DATABASE_URL`
- Both `createDb()` (factory) and `db` (singleton instance) exported

## 5. Existing tRPC Router/Procedure Patterns

### Setup (packages/api/src/index.ts)
- `initTRPC.context<Context>().create()` — standard tRPC v11 setup
- `publicProcedure` — no auth check
- `protectedProcedure` — middleware checks `ctx.session`, throws UNAUTHORIZED if null; narrows session type to non-null

### Context (packages/api/src/context.ts)
- `createContext({ req })` — extracts session from request headers via Better Auth
- Returns `{ auth: null, session }` where session is nullable

### Router (packages/api/src/routers/index.ts)
- Single file with `appRouter` containing:
  - `healthCheck`: publicProcedure.query() — returns "OK"
  - `privateData`: protectedProcedure.query() — returns message + user info
- `AppRouter` type exported for client usage

### API Handler (web)
- `apps/web/src/routes/api/trpc/$.ts` — tRPC fetch adapter mounted at `/api/trpc`
- Uses `fetchRequestHandler` with `appRouter` and `createContext`

### tRPC Client (web)
- `apps/web/src/utils/trpc.ts` — `createTRPCContext<AppRouter>()` providing `TRPCProvider`, `useTRPC`, `useTRPCClient`
- `apps/web/src/router.tsx` — `createTRPCClient` with `httpBatchLink` to `/api/trpc`, credentials: "include"
- `createTRPCOptionsProxy` used for React Query integration

## 6. Existing UI/Formedible/shadcn Setup

### shadcn Configuration
- **packages/ui/components.json**: style `base-lyra`, RSC false, base color neutral, CSS variables enabled, icon library lucide
- **apps/web/components.json**: mirrors UI config, CSS path points to `../../packages/ui/src/styles/globals.css`

### UI Package Structure
- `components/`: button, card, checkbox, dropdown-menu, input, label, skeleton, sonner (8 components)
- `hooks/`: empty (`.gitkeep`)
- `lib/utils.ts`: `cn()` utility (clsx + tailwind-merge)
- `styles/globals.css`: Tailwind CSS v4 with oklch color tokens, dark mode via `.dark` class, shadcn CSS variables, `tw-animate-css` integration

### Component Pattern
- Function declarations, named exports
- `data-slot` attributes
- `cn()` for class merging
- CVA for button variants
- Base UI primitives (`@base-ui/react`) used under the hood

### Web App UI
- Routes: `/` (home/health check), `/login` (auth forms), `/dashboard` (protected)
- Components: header, loader, sign-in-form, sign-up-form, user-menu
- Global CSS imports from `@DCRM/ui/globals.css`
- Default dark mode (`className="dark"` on html)
- Sonner for toast notifications

### Formedible
- **Formedible is NOT installed or configured anywhere in the codebase.**
- The PRD requires Formedible for all application forms except Better Auth auth forms.
- Current auth forms use `@tanstack/react-form` directly (which is correct per PRD exception).
- `@tanstack/react-form` is in the catalog at `^1.28.0` and installed in both web and native.
- Formedible from formedible.dev needs to be added as a dependency and integrated.

## 7. Existing Native and Desktop Setup

### Native (apps/native)
- Expo 56 with expo-router
- Uniwind for styling (tailwind-variants + tailwind-merge)
- tRPC client setup in `utils/trpc.ts`
- Auth client in `lib/auth-client.ts`
- Components: container, sign-in, sign-up, theme-toggle
- App layout in `app/_layout.tsx`, drawer layout in `app/(drawer)/`
- Env: `EXPO_PUBLIC_SERVER_URL`

### Desktop (apps/desktop)
- Electrobun 1.15.1
- Config in `electrobun.config.ts`: wraps web build from `../web/dist/client`
- Bun entrypoint creates BrowserWindow, supports HMR via web dev server
- Cross-platform: macOS, Linux, Windows (CEF)
- No DCRM-specific logic — thin wrapper as PRD requires

## 8. Environment Variables

### Server (packages/env/src/server.ts)
```
DATABASE_URL          - z.string().min(1)
BETTER_AUTH_SECRET    - z.string().min(32)
BETTER_AUTH_URL       - z.url()
CORS_ORIGIN           - z.url()
NODE_ENV              - development|production|test (default: development)
```

### Web Client (packages/env/src/web.ts)
- Client prefix: `VITE_`
- No client env vars defined currently

### Native Client (packages/env/src/native.ts)
- Client prefix: `EXPO_PUBLIC_`
- `EXPO_PUBLIC_SERVER_URL` - z.url()

### Web .env (committed)
```
BETTER_AUTH_SECRET=qj2CXH5WygBCdhEC2RVClTqRK4Tjr0zK
BETTER_AUTH_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/DCRM
```

### Missing Env Vars (Required by PRD)
- Redis/BullMQ connection
- Encryption master key (for crypto module)
- Storage config (local path or S3 credentials)
- Stripe keys (optional/env-gated)
- Webhook base URL
- App URL

## 9. Known Gaps Before Implementation

### Infrastructure Gaps
1. **No test runner**: No vitest config, no test files, no test scripts. Must be set up before code-bearing phases.
2. **No migrations generated**: DB schema exists but no migration files. Need to decide migration strategy.
3. **No Redis/BullMQ**: Not installed, not configured. Required for event engine hooks and background jobs.
4. **No crypto module**: Required for encrypting AI keys, email credentials, webhook secrets.
5. **No Formedible**: Must be added as dependency and integrated before any CRM forms are built.

### Schema Gaps
6. **No CRM tables**: Only auth tables exist. All CRM domain tables (clients, leads, projects, tickets, exchanges, tags, attachments, events, hooks, etc.) need to be created.
7. **No automation tables**: Events, hooks, hook executions, incoming webhooks, AI providers, insights, email accounts, API keys, billing — all missing.
8. **No custom field support**: No schema for custom field definitions or values.

### API Gaps
9. **No CRM API routes**: Only healthCheck and privateData placeholder procedures exist.
10. **No API key auth**: Protected procedures only check session. No API key generation/verification.
11. **No event emission**: No event engine exists. All CRUD operations will need to emit events.
12. **No user scoping in queries**: Current protected procedure doesn't enforce userId scoping on data — the pattern exists but no data tables use it yet.

### Module Gaps
13. **No event engine**: Core extensibility backbone completely absent.
14. **No AI module**: No TanStack AI integration, no provider adapters, no structured output handling.
15. **No email module**: No IMAP/SMTP handling.
16. **No storage module**: No file upload/attachment handling.
17. **No billing module**: No Stripe integration.
18. **No i18n module**: No internationalization support.

### Code Quality Notes
19. **`packages/env/src/web.ts` uses `(import.meta as any).env`** — violates the no-any rule. Should use proper typing.
20. **`packages/api/src/context.ts`** returns `{ auth: null, session }` — the `auth` field is unused/null and should be cleaned up or repurposed.
21. **Pre-existing typecheck failure in `desktop`** — `electrobun` depends on `three` which lacks type declarations. This is an upstream issue in electrobun, not in DCRM code.
22. **Sign-in/sign-up forms in web use `@tanstack/react-form` directly** — this is correct per PRD (auth forms are Better Auth owned, not Formedible). However the PRD says "Better Auth to own login/logout/signup forms" — current implementation uses tanstack/react-form for form state with Better Auth client for auth calls, which is a reasonable interpretation.

### Dependency Notes
23. **No Vercel AI SDK** is present — good, PRD prohibits it.
24. **Zod 4** is used via catalog (`^4.1.13`) — consistent with AGENTS.md requirement.
25. **TypeScript 6** is in catalog (`^6`) — latest major version.
26. **tRPC 11** is used — latest major version.
27. **`@tanstack/react-form`** is in catalog but **Formedible** is not — needs to be added.

## 10. TypeScript Configuration

### Base Config (packages/config/tsconfig.base.json)
Key flags: strict, verbatimModuleSyntax, noUncheckedIndexedAccess, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch, types: ["node"]

### Package Configs
- API, Auth, DB: extend base, add composite + declaration + sourcemaps
- UI: extends base, adds jsx: react-jsx, DOM libs, paths alias
- Env: extends base only
- Desktop: extends base, adds DOM lib, paths alias
- Web: standalone config (does not extend base), includes DOM + Vite types, path alias `@/*` -> `./src/*`, `@DCRM/ui/*` -> `../../packages/ui/src/*`

## 11. pnpm check-types Result

**FAILS** — desktop package fails due to upstream electrobun dependency issue:
```
../../node_modules/.pnpm/electrobun@1.18.1/node_modules/electrobun/dist/api/bun/index.ts(32,24): error TS7016: 
Could not find a declaration file for module 'three'.
```

All other packages pass type checking. The desktop failure is in node_modules (electrobun's own code referencing `three`), not in DCRM code. This is a pre-existing issue that should be fixed separately (either by adding `@types/three` to desktop devDeps, adding a declaration file, or waiting for electrobun to fix it).
