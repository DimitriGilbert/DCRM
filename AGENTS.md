# AGENTS.md

DCRM — micro CRM for independent contractors. Single-user only (no teams, no orgs, no collaboration). TanStack Start + tRPC + Drizzle/PostgreSQL + Better Auth. Scaffolded with Better-T-Stack.

## Package Manager

pnpm (corepack). Always run commands from repo root.

## Monorepo

pnpm workspaces + Turborepo. Per-package: `pnpm --filter <name> <script>`. Cross-package: `pnpm turbo <task>`.

| Package | Name | Purpose |
|---------|------|---------|
| `apps/web` | `web` | TanStack Start (Vite + React 19 + Router + React Query) |
| `apps/native` | `native` | Expo + Uniwind (mobile) |
| `apps/desktop` | `desktop` | Electrobun wrapper around web build |
| `packages/api` | `@DCRM/api` | tRPC routers, procedures, context |
| `packages/auth` | `@DCRM/auth` | Better Auth config, session handling |
| `packages/db` | `@DCRM/db` | Drizzle schema, migrations, PostgreSQL |
| `packages/ui` | `@DCRM/ui` | shadcn/base-ui + CVA + Tailwind CSS v4 |
| `packages/env` | `@DCRM/env` | Env validation (@t3-oss/env-core + Zod 4) |
| `packages/config` | `@DCRM/config` | Shared TS configs |

## Build & Typecheck

```bash
pnpm build              # Build all packages
pnpm check-types        # Typecheck all packages
pnpm --filter web vite build   # Build web app only
pnpm --filter web tsc --noEmit  # Typecheck web app only
```

## LSP Errors

Fix all TypeScript errors before finishing a task. Run `pnpm check-types` to verify.

## Testing

No test runner configured yet. When adding tests, use vitest with `@testing-library/react` and `jsdom` (both in web devDeps).

## TypeScript — Strict Rules

Base config: `packages/config/tsconfig.base.json`. Key flags: `strict`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.

- `verbatimModuleSyntax: true` — always use `import type` for type-only imports
- Path alias in web: `@/*` → `./src/*`

## Code Rules

### No `any`

Never use `any`, `as any`, `: any`. Use proper types, `unknown`, or branded types.

### DRY — Components & Types

- Search for existing components before creating new ones. Use `@DCRM/ui/components` first, then `apps/web/src/components/`.
- Pages must not define non-exported helper components. Extract reusable or non-trivial UI into the component directory.
- Single source of truth for types. Shared types go in dedicated type modules. Never redeclare across files.

### Dependencies

Check `pnpm-workspace.yaml` catalog and existing `package.json` files before adding packages. Use `catalog:` references when available.

### Imports

External/workspace imports first, blank line, then local `@/` imports.

### Components

UI library: `function` declarations, named exports, `data-slot="component-name"`, merge classes with `cn()`, variants via CVA. Web app: `export default function` for route pages.

### tRPC API

One query/mutation per file, named export. Auth context from `@DCRM/auth`. All data scoped by `userId`.

### shadcn Components

When a component is needed and not in `packages/ui/src/components/`:

```bash
pnpm --filter @DCRM/ui dlx shadcn@latest add <component>
```

Check existing components first.

### Zod

Zod 4 syntax only. `z.object(...)`, `z.string()`, `z.email()`.

### Styling

Tailwind CSS v4 utility classes. `className` for all styling. Dark mode: class-based.

## Product Constraints

- Single-user CRM only. No organizations, teams, collaboration, shared workspaces, invitations, or role-based member permissions.
- AI integration uses TanStack AI only. Do not add the Vercel AI SDK `ai` package.
- All application forms use Formedible, except Better Auth login/logout/signup forms.
- Every meaningful action emits a typed event through the event engine.

## Relevant Skills

- **TanStack Start:** use `tanstack-start` skill
- **TanStack AI:** use `tanstack-ai` skill
- **tRPC:** use `trpc` skill
- **React best practices:** use `vercel-react-best-practices` skill
- **shadcn components:** use `shadcn` skill
- **Formedible forms:** use `formedible` skill

## Progressive Disclosure

- Product requirements: `prd.v3.md`
- Orchestration plan: `orchestration-plan.md`
- Environment variables: `packages/env/` via @t3-oss/env-core
- Database schema: `packages/db/src/schema/`
- API routers: `packages/api/src/routers/`
- TanStack Start routing: `apps/web/src/routes/`
