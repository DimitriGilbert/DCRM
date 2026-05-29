# DCRM Subagent Orchestration Plan

This plan implements `prd.v3.md` using the `subagent-orchestration` workflow.

The filename `prd.v3.md` is a PRD document revision, not a product release version. This orchestration plan should not reinterpret it as a product version plan.

## Execution Rule

Do not execute this plan until the user explicitly approves execution.

Once approved, the orchestrator must execute the plan through subagents only:

- 1 implementer per sub-phase.
- Each implementer uses TDD vertical slices for code-bearing work: one failing behavior test, minimal implementation to pass, repeat.
- 1 validator immediately after each implementer.
- Fixer loop for all validator issues at once, up to 3 attempts.
- Phase-wide validator after all sub-phases in a multi-sub-phase phase pass.
- No mid-flight user questions unless execution cannot continue after retries or an environmental blocker.

## Non-Negotiable Product Constraints

- DCRM is single-user only: no organizations, no teams, no collaboration, no shared workspaces, no invitations, no role-based member permissions.
- Hosted service price is `$24/year`.
- The project is open source with a permissive license posture.
- AI is BYOK only.
- AI integration uses **TanStack AI only**.
- **Do not use Vercel AI SDK**.
- **Do not add the Vercel AI SDK `ai` package**.
- Supported AI providers: OpenRouter, OpenAI with custom base URL compatibility, Anthropic with custom base URL compatibility, Google.
- All application forms use Formedible from `formedible.dev`, except Better Auth login/logout/signup/auth-managed forms.
- Every meaningful action emits an event.
- Incoming webhooks map external payloads into internal DCRM events, not direct record mutations.
- New incoming webhook mappings start in test mode.
- Hook-driven writes do not emit downstream hook automation by default.
- AI hook writes are configurable per hook: propose-first or direct-write.
- Hosted deployment uses Dokploy with docker-compose.
- Background jobs use BullMQ with Redis.

## Mandatory NO-SLOP Policy

Every implementer and fixer dispatch must include this policy verbatim. Every validator must enforce it strictly.

- NO `any`, `as any`, `: any` ANYWHERE.
- NO placeholder code, NO `// TODO`, NO `// FIXME`.
- NO unused imports, NO unused variables.
- NO console.log hacks to suppress errors. NO void hacks.
- Use `import type` for type-only imports.
- External imports first, blank line, then local imports.
- ONE query/mutation per file, named export.
- Do NOT start the dev server.
- Do NOT introduce the Vercel AI SDK or the `ai` package.
- Do NOT create team/org/collaboration concepts.
- Do NOT create bespoke app forms when Formedible should be used.

## Mandatory TDD Policy

Every code-bearing implementation sub-phase must use test-driven development. Documentation-only phases, deployment-only file changes, and purely visual wiring may be exempt only when the implementer explicitly explains why no meaningful automated behavior test applies.

TDD means vertical slices, not horizontal test batches:

- Write one behavior test for one observable capability.
- Run it and confirm it fails for the expected reason.
- Write the minimal implementation needed to pass that test.
- Run the test and confirm it passes.
- Repeat for the next behavior.
- Refactor only after tests are green.

Tests must verify behavior through public interfaces:

- API behavior should be tested through tRPC callers or public service interfaces, not private functions.
- Event engine behavior should be tested through event emission and execution APIs, not internal queue helper details.
- AI behavior should use mocked TanStack AI providers at the adapter boundary, not mocked internal helpers.
- Webhook mapping should be tested through the mapper/endpoint public interface and observable internal event output.
- Email behavior should use mocked IMAP/SMTP payloads at the integration boundary, not private parser internals.
- UI behavior should test rendered user behavior and submitted Formedible flows where feasible, not component internals.

TDD anti-patterns are forbidden:

- Do not write all tests first and then all implementation.
- Do not test imagined internal shapes before a public interface exists.
- Do not mock internal collaborators just to assert implementation details.
- Do not keep tests that fail after a harmless internal refactor while behavior is unchanged.

Every implementer and fixer report for a code-bearing phase must include TDD evidence:

- Behaviors tested.
- RED command/result for at least the first new failing behavior test in the sub-phase.
- GREEN command/result after implementation.
- Refactor step, if any, and tests run after refactor.
- Any behavior intentionally left untested and why.

Validators must reject a code-bearing phase when TDD evidence is missing, when tests are implementation-coupled, or when the implementation was delivered as a large horizontal batch without incremental behavior tests.

## Gatekeeping Commands

Implementers and fixers must run gatekeeping commands before reporting done. Validators must run them again after reading the code.

Preferred repository-wide commands:

- `pnpm check-types`
- `pnpm build`

Test commands:

- Run the relevant package/app test command if one exists.
- If a touched package has no test command and the sub-phase requires behavior tests, add the minimal project-consistent test setup for that package before implementing the behavior.
- If a behavior cannot be automated in the current repo setup, document the reason and provide the closest automated coverage possible.

When a phase only touches one package/app and repository-wide commands are too expensive, the subagent may also run the relevant filtered Turbo command, but the validator should run repository-wide commands before passing a major phase.

Do not run `pnpm dev`, `pnpm dev:web`, `pnpm dev:native`, or `pnpm dev:desktop` during orchestration.

## Max Fix Attempts

Each validation stage allows up to 3 fixer attempts. If the validator still fails after the third fixer attempt, halt execution and report:

- Phase and sub-phase name.
- Files with issues.
- Full validator report.
- Commands run and failures.
- Recommended plan adjustment.

## Phase 0 - Repository And Architecture Audit

Type: Sequential single-sub-phase.

Purpose: Establish exact current project structure and implementation baseline before changes.

Read:

- `prd.v3.md`
- root package/workspace config
- existing app/package entry points
- existing auth, API, DB, UI, web, native, and desktop package structure
- existing Drizzle schema and Better Auth setup
- existing shadcn/Formedible-related setup if present

Create/modify:

- `implementation-notes.md` or update an existing architecture notes file if one already exists and is clearly intended for this purpose.

Requirements:

- Document current package/app layout.
- Document available scripts and validation commands.
- Document existing auth/session patterns.
- Document existing DB schema and migration setup.
- Document existing tRPC router/procedure patterns.
- Document existing UI/Formedible/shadcn setup.
- Document known gaps before implementation.
- Do not implement product features in this phase.

Validation:

- Validator reads the notes and verifies they accurately reflect the repo.
- Validator verifies no product code was changed except the notes file.
- Validator runs `pnpm check-types`.

## Phase 1 - Shared Domain Foundations

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Establish stable domain types, constants, environment, and package boundaries before feature work.

### Phase 1A - Domain Constants And Types

Read:

- `prd.v3.md`
- Phase 0 notes
- existing DB/API type exports

Create/modify:

- shared domain package or existing suitable package exports for domain enums/constants
- exports used by DB, API, web, native, and worker modules

Requirements:

- Define domain constants for client, lead, project, ticket, exchange, attachment, event, hook, AI provider, webhook, billing, and user settings concepts.
- Define fixed statuses/stages/types from `prd.v3.md`.
- Preserve single-user assumptions.
- Avoid UI-specific types in domain foundations.
- Avoid database-only implementation leaking into UI type contracts unless intentionally exported.

Validation:

- Validator reads all created/modified files.
- Validator checks enum/status values against `prd.v3.md`.
- Validator enforces NO-SLOP.
- Validator runs `pnpm check-types`.

### Phase 1B - Environment Schema

Read:

- `prd.v3.md`
- Phase 0 notes
- existing env package

Create/modify:

- environment schema/config exports

Requirements:

- Add typed env support for database, Redis, Better Auth, encryption key, storage, Stripe, hosted billing switch, app URL, and webhook base URL.
- Keep optional integrations optional where PRD says env-gated.
- Do not require Stripe for self-hosting.
- Do not require S3 for self-hosting.
- Ensure Redis is represented as required for background jobs.

Validation:

- Validator reads env schema.
- Validator verifies self-hosting does not require billing/S3.
- Validator enforces NO-SLOP.
- Validator runs `pnpm check-types`.

Phase-wide validation for Phase 1:

- Confirm domain constants and env schema integrate without circular dependencies.
- Confirm no Vercel AI SDK dependency was introduced.
- Run `pnpm check-types` and `pnpm build`.

## Phase 2 - Database Schema And Migrations

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Build the persistent model for the CRM and automation system.

### Phase 2A - Core CRM Schema

Read:

- `prd.v3.md`
- Phase 0 notes
- Phase 1 domain constants
- existing Drizzle schema

Create/modify:

- Drizzle tables/enums for clients, leads, projects, tickets, exchanges, exchange participants, tags, entity tags, attachments, user settings
- database exports
- migration files if this repo uses generated migrations

Requirements:

- All user-owned records include `userId`.
- Core records include `createdAt` and `updatedAt`.
- Soft-deletable records include `deletedAt`.
- Use PostgreSQL-compatible types.
- Use JSONB where appropriate for custom fields, social links, addresses, metadata.
- Model per-entity currency fields without conversion logic.
- Model ticket comments as exchanges.
- Preserve single-user data scope.

Validation:

- Validator reads schema line by line.
- Validator verifies all required tables and relationships exist.
- Validator checks user scoping and soft-delete support.
- Validator enforces NO-SLOP.
- Validator runs DB generation/check commands appropriate to the repo plus `pnpm check-types`.

### Phase 2B - Automation And Integration Schema

Read:

- `prd.v3.md`
- Phase 1 domain constants
- Phase 2A schema

Create/modify:

- event definitions/events
- hooks
- hook executions
- incoming webhooks
- AI providers
- AI insights/messages
- email accounts/sync state
- API keys
- subscriptions/billing state

Requirements:

- Incoming webhooks store mapping config and test/live state.
- Hooks store type, config, output schema, field mapping, enabled state, write behavior, and downstream event behavior.
- Hook execution stores input, output, status, errors, timestamps, retry metadata.
- AI provider secrets are stored as encrypted values.
- Email credentials are stored as encrypted values.
- API keys store hashes, not raw keys.
- Billing schema is optional/env-gated at runtime, but table support may exist.

Validation:

- Validator reads schema line by line.
- Validator verifies secret-bearing fields are modeled as encrypted payloads or encrypted value containers, not plaintext intent.
- Validator verifies incoming webhooks do not model direct mutation as default behavior.
- Validator enforces NO-SLOP.
- Validator runs DB generation/check commands appropriate to the repo plus `pnpm check-types`.

Phase-wide validation for Phase 2:

- Confirm schema names, references, and exports are coherent.
- Confirm all tables are user-scoped where required.
- Confirm generated migrations are consistent if migrations are used.
- Run `pnpm check-types` and `pnpm build`.

## Phase 3 - Security, Crypto, Auth, And API Key Foundations

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Create secure foundations before external integrations or AI.

### Phase 3A - Crypto Module

Read:

- `prd.v3.md`
- env schema
- existing package patterns

Create/modify:

- crypto package or equivalent module
- tests for encryption/decryption behavior

Requirements:

- Provide AES-256-GCM or equivalent authenticated encryption.
- Accept a master encryption key from typed env.
- Return structured encrypted values containing ciphertext, IV/nonce, auth tag, and version metadata.
- Decrypt only through explicit function calls.
- Never log secrets.
- Tests cover roundtrip, tamper failure, and wrong-key failure.

Validation:

- Validator reads crypto implementation and tests.
- Validator verifies authenticated encryption, not bare hashing or unauthenticated encryption.
- Validator enforces NO-SLOP.
- Validator runs relevant tests and `pnpm check-types`.

### Phase 3B - Auth And API Keys

Read:

- `prd.v3.md`
- existing Better Auth setup
- API package auth context
- DB API key schema

Create/modify:

- API key generation/verification module
- auth context/middleware support for session or API key where intended
- tests for API key hashing/verification

Requirements:

- Better Auth remains responsible for user login/logout/signup auth flows.
- API keys are shown once and stored hashed.
- API keys include name, created date, last used date.
- API key auth resolves a user context.
- No team/org concepts.

Validation:

- Validator reads auth/API key code.
- Validator verifies raw API keys are not stored.
- Validator verifies session and API key auth are not confused.
- Validator enforces NO-SLOP.
- Validator runs relevant tests and `pnpm check-types`.

Phase-wide validation for Phase 3:

- Confirm crypto is used by secret-bearing modules through stable interfaces.
- Confirm API key auth and session auth produce consistent user scoping.
- Run `pnpm check-types` and `pnpm build`.

## Phase 4 - Event Engine Core

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Build the extensibility backbone before CRUD side effects are wired.

### Phase 4A - Event Emission And Persistence

Read:

- `prd.v3.md`
- Phase 2 schema
- Phase 3 auth/user context

Create/modify:

- event engine package/module
- typed event definitions
- event persistence API
- tests for event creation and user scoping

Requirements:

- Provide typed event emission for app, API, email, webhook, hook, and system sources.
- Persist normalized event payloads.
- Include userId on every event.
- Include optional entity reference and changes.
- Do not execute hooks yet in this sub-phase.

Validation:

- Validator reads event emission code and tests.
- Validator verifies user scoping and event shape.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

### Phase 4B - Hook Subscription And Execution Queue

Read:

- `prd.v3.md`
- Phase 4A event engine
- BullMQ/Redis env config
- hook schema

Create/modify:

- hook subscription resolver
- BullMQ queue setup
- hook execution lifecycle records
- retry policy support
- tests for fire-all execution and failure isolation

Requirements:

- Multiple hooks can subscribe to one event.
- Hooks run asynchronously through BullMQ.
- Same-event hooks are fire-all and independent.
- Execution records move through pending/running/success/failed states.
- Failed hooks do not block sibling hooks.
- Retry policy is represented and used.

Validation:

- Validator reads queue and execution code.
- Validator verifies BullMQ is used, not in-process-only background execution.
- Validator verifies hook failure isolation.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

### Phase 4C - Hook Write Provenance And Loop Suppression

Read:

- `prd.v3.md`
- Phase 4A/4B event engine

Create/modify:

- hook write context/provenance helpers
- downstream event suppression logic
- tests for loop suppression default

Requirements:

- Hook-driven writes do not trigger downstream hook automation by default.
- Hook-driven writes record provenance.
- Architecture leaves room for explicit opt-in downstream event emission later.
- Tests prove default suppression.

Validation:

- Validator reads loop suppression implementation.
- Validator verifies default behavior matches PRD.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

Phase-wide validation for Phase 4:

- Confirm event emission, hook resolution, queueing, execution records, and loop suppression work together.
- Confirm no direct user-facing feature bypasses event engine assumptions.
- Run `pnpm check-types` and `pnpm build`.

## Phase 5 - Core CRM API

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Implement user-scoped tRPC CRUD and domain behavior for core CRM entities.

### Phase 5A - Clients, Tags, And Custom Fields API

Read:

- `prd.v3.md`
- Phase 2 schema
- Phase 4 event engine
- existing tRPC patterns

Create/modify:

- client procedures
- tag procedures
- custom field handling for clients
- tests through tRPC caller

Requirements:

- Create/read/update/soft-delete/restore clients.
- User-scoped queries only.
- Search clients by core fields.
- Manage tags and entity tags.
- Emit events for meaningful writes.
- Support custom fields using validated schemas/values.

Validation:

- Validator reads all procedures and tests.
- Validator verifies one query/mutation per file if applicable to project procedure organization.
- Validator verifies user scoping and events.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

### Phase 5B - Leads And Conversion API

Read:

- `prd.v3.md`
- Phase 5A patterns
- Phase 4 event engine

Create/modify:

- lead procedures
- lead pipeline/stage update procedures
- lead conversion procedure
- tests through tRPC caller

Requirements:

- CRUD leads.
- Fixed stages.
- Kanban-friendly list grouping.
- Lead conversion creates client, archives/preserves lead history, re-links relevant attachments where modeled.
- Emit create/update/delete/stage_changed/conversion events.

Validation:

- Validator reads procedures and tests.
- Validator verifies conversion behavior.
- Validator verifies no team/org concepts.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

### Phase 5C - Projects API

Read:

- `prd.v3.md`
- Phase 5A/5B patterns
- Phase 4 event engine

Create/modify:

- project procedures
- project status handling
- project hours/budget handling
- tests through tRPC caller

Requirements:

- CRUD projects tied to clients.
- Fixed statuses.
- Budget amount plus currency without conversion.
- Estimated/actual hours.
- Custom fields and tags.
- Emit lifecycle and status_changed events.

Validation:

- Validator reads procedures and tests.
- Validator verifies client ownership scoping.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

### Phase 5D - Tickets And Exchanges API

Read:

- `prd.v3.md`
- Phase 5C projects
- Phase 4 event engine

Create/modify:

- ticket procedures
- exchange procedures
- ticket comments as exchanges
- tests through tRPC caller

Requirements:

- CRUD tickets inside projects.
- Fixed ticket types, statuses, and priorities.
- Due dates.
- Comments stored as exchanges.
- Internal notes never externally sendable.
- Unified timeline query by client/project/ticket.
- Emit lifecycle/status/exchange events.

Validation:

- Validator reads procedures and tests.
- Validator verifies comments and notes semantics.
- Validator verifies user scoping through parent relationships.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

Phase-wide validation for Phase 5:

- Confirm all core CRM APIs share validation patterns, event emission, user scoping, and soft-delete behavior.
- Confirm no API path introduces org/team/collab concepts.
- Run `pnpm check-types` and `pnpm build`.

## Phase 6 - Formedible Web UI For Core CRM

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Build usable web UI for core CRM without bespoke forms.

### Phase 6A - App Shell, Navigation, Dashboard

Read:

- `prd.v3.md`
- existing TanStack Start routes
- UI package patterns
- tRPC client patterns

Create/modify:

- app shell/navigation
- dashboard route/components
- settings navigation placeholders as needed

Requirements:

- Dashboard shows active clients, active projects, open tickets, lead pipeline summary, upcoming deadlines, recent activity.
- Quick actions link to create flows.
- Preserve existing design system patterns.
- Responsive desktop/mobile web layout.
- No Formedible requirement for read-only dashboard widgets.

Validation:

- Validator reads UI code.
- Validator verifies dashboard data comes from API or typed stubs only where explicitly marked as not final; no placeholder TODOs.
- Validator enforces NO-SLOP.
- Validator runs `pnpm check-types` and `pnpm build`.

### Phase 6B - Client And Lead UI With Formedible

Read:

- `prd.v3.md`
- Formedible setup
- client/lead API
- UI package patterns

Create/modify:

- client list/detail/create/edit routes
- lead list/kanban/detail/create/edit/convert routes
- Formedible schemas for all create/edit forms

Requirements:

- All client and lead forms use Formedible.
- Search/filter/tag UI included where API supports it.
- Lead kanban supports stage movement.
- Conversion flow is explicit.
- No Better Auth form changes unless needed for navigation.

Validation:

- Validator reads forms and verifies Formedible usage.
- Validator verifies no bespoke form bypass.
- Validator enforces NO-SLOP.
- Validator runs `pnpm check-types` and `pnpm build`.

### Phase 6C - Project, Ticket, Exchange UI With Formedible

Read:

- `prd.v3.md`
- project/ticket/exchange API
- Formedible setup

Create/modify:

- project list/detail/create/edit routes
- ticket list/kanban/detail/create/edit routes
- exchange timeline components
- Formedible schemas for all create/edit forms

Requirements:

- Project and ticket forms use Formedible.
- Ticket comments and internal notes are visually distinct.
- Notes are never presented as email-sendable.
- Unified timeline appears in client/project/ticket context.

Validation:

- Validator reads UI code and verifies Formedible usage.
- Validator verifies internal note safety.
- Validator enforces NO-SLOP.
- Validator runs `pnpm check-types` and `pnpm build`.

Phase-wide validation for Phase 6:

- Confirm UI navigation, API usage, Formedible forms, and timeline behavior are coherent.
- Confirm no app forms bypass Formedible except Better Auth auth forms.
- Run `pnpm check-types` and `pnpm build`.

## Phase 7 - Attachments, Search, Import/Export, Notifications, I18n

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Add supporting product capabilities around the core CRM.

### Phase 7A - Storage And Attachments

Read:

- `prd.v3.md`
- env schema
- attachment schema
- core API patterns

Create/modify:

- storage module with local and S3-compatible abstraction
- attachment API procedures
- attachment UI components using Formedible where forms are used
- tests for storage abstraction

Requirements:

- Local storage works by default.
- S3-compatible storage is selected/configured by env.
- Attachments link to supported entity types.
- File size/quota checks are represented.
- Metadata stored in DB.

Validation:

- Validator reads storage and attachment code.
- Validator verifies self-host local default.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

### Phase 7B - Global Search And Filters

Read:

- `prd.v3.md`
- core schema/API

Create/modify:

- global search procedures
- list filter support where missing
- global search UI

Requirements:

- Use simple database-backed search on core fields.
- Search clients, leads, projects, tickets, exchanges.
- Support filters by tags, status, date range, and entity type where applicable.
- Do not introduce semantic/vector search.

Validation:

- Validator reads search implementation.
- Validator verifies simple DB search only.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

### Phase 7C - Import/Export And Notifications

Read:

- `prd.v3.md`
- core API patterns
- event engine

Create/modify:

- CSV client import
- CSV/JSON list export
- full data export foundation
- in-app notification schema/API/UI

Requirements:

- Import emits events.
- Export is user-scoped.
- Notifications are in-app only.
- Hook failures surface in hook status UI, not notification spam.
- Forms/config flows use Formedible.

Validation:

- Validator reads import/export/notification code.
- Validator verifies user scoping.
- Validator enforces NO-SLOP.
- Validator runs tests and `pnpm check-types`.

### Phase 7D - I18n Foundation

Read:

- `prd.v3.md`
- app shell and user settings

Create/modify:

- i18n module or package
- English default strings
- user locale setting
- onboarding language step

Requirements:

- English default locale.
- Translation mechanism established early.
- User locale stored in settings.
- Avoid hardcoding new user-facing strings where i18n integration is expected.

Validation:

- Validator reads i18n setup.
- Validator checks user locale persistence.
- Validator enforces NO-SLOP.
- Validator runs `pnpm check-types` and `pnpm build`.

Phase-wide validation for Phase 7:

- Confirm supporting modules integrate with CRM API, events, and UI.
- Confirm no advanced out-of-scope search or notification channels were introduced.
- Run `pnpm check-types` and `pnpm build`.

## Phase 8 - AI Module And AI Hooks

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Implement BYOK TanStack AI integration and AI hook behavior.

### Phase 8A - TanStack AI Provider Adapters

Read:

- `prd.v3.md`
- crypto module
- AI provider schema
- TanStack AI documentation as needed

Create/modify:

- AI module/package
- OpenRouter adapter
- OpenAI adapter with custom base URL compatibility
- Anthropic adapter with custom base URL compatibility
- Google adapter
- provider settings API/UI using Formedible
- tests with mocked providers

Requirements:

- Use TanStack AI only.
- Do not add Vercel AI SDK.
- Store API keys encrypted.
- Provider config is BYOK.
- No bundled AI credits.
- Provider forms use Formedible.

Validation:

- Validator reads dependencies, imports, implementation, tests, and UI forms.
- Validator verifies no Vercel AI SDK usage.
- Validator verifies Formedible provider forms.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

### Phase 8B - Structured AI Hook Execution

Read:

- `prd.v3.md`
- event engine
- AI adapters
- hook schema

Create/modify:

- AI hook executor
- structured output validation
- field mapping engine
- AI insight storage
- hook config UI using Formedible
- tests for propose-first and direct-write modes

Requirements:

- AI hooks run from event context.
- Structured outputs are validated before use.
- Field mapping can propose changes or directly apply changes based on per-hook setting.
- AI insights are stored even when fields are not changed.
- Direct writes respect hook loop suppression defaults.
- Built-in templates: summarize, classify, extract_contacts, enrich_from_web.

Validation:

- Validator reads AI hook code and tests.
- Validator verifies write behavior setting.
- Validator verifies loop suppression integration.
- Validator verifies Formedible config forms.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

### Phase 8C - AI Chat Assistant

Read:

- `prd.v3.md`
- AI adapters
- core CRM API/services

Create/modify:

- AI chat message persistence
- server-side CRM tools for AI chat
- chat API/UI
- tests with mocked providers/tools

Requirements:

- Multi-turn conversation history.
- AI uses explicit server-side CRM tools, not direct model access to arbitrary tRPC procedures.
- Tools include search clients, summarize project, list open tickets, pipeline summary, and recent exchanges.
- Tool execution is user-scoped and auditable.
- TanStack AI only.

Validation:

- Validator reads AI chat code and tools.
- Validator verifies tool boundaries and user scoping.
- Validator verifies no Vercel AI SDK usage.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

Phase-wide validation for Phase 8:

- Confirm all AI paths use TanStack AI only.
- Confirm encrypted key boundaries.
- Confirm hook execution and AI chat use different controlled interfaces where appropriate.
- Run dependency inspection, `pnpm check-types`, and `pnpm build`.

## Phase 9 - Webhooks And External Automation

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Complete outgoing and incoming webhook automation on top of the event engine.

### Phase 9A - Outgoing Webhooks

Read:

- `prd.v3.md`
- event engine
- hook schema
- crypto module

Create/modify:

- outgoing webhook hook executor
- auth config handling
- retry behavior
- hook config UI using Formedible
- tests for auth modes and retry behavior

Requirements:

- Supports bearer token, basic auth, HMAC signature, and custom headers.
- Secret-bearing webhook config is encrypted where appropriate.
- Retries transient failures.
- Execution results logged.
- One webhook failure does not block sibling hooks.

Validation:

- Validator reads webhook executor and tests.
- Validator verifies auth modes.
- Validator verifies secret handling.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

### Phase 9B - Incoming Webhooks And Mapping

Read:

- `prd.v3.md`
- event engine
- incoming webhook schema

Create/modify:

- incoming webhook endpoint
- secret/token verification
- JSON path mapping engine
- test-mode preview flow
- mapping UI using Formedible where forms are used
- tests for mapping and test/live behavior

Requirements:

- Incoming webhooks create internal DCRM events.
- Incoming webhooks do not directly mutate CRM records.
- New mappings start in test mode.
- Test mode previews mapped event payloads before live emission.
- Live mode emits normalized internal events.
- Mapping config is stored as JSON.

Validation:

- Validator reads endpoint, mapper, UI, and tests.
- Validator verifies no direct mutation path is introduced.
- Validator verifies test-mode default.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

Phase-wide validation for Phase 9:

- Confirm outgoing and incoming webhooks share event/hook concepts correctly.
- Confirm incoming webhook events can trigger subscribed hooks.
- Run `pnpm check-types` and `pnpm build`.

## Phase 10 - Email Integration

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Add IMAP/SMTP exchange sync and ticket email behavior.

### Phase 10A - Email Account Config And Matching

Read:

- `prd.v3.md`
- crypto module
- email account schema
- client authorized email model

Create/modify:

- email account config API/UI using Formedible
- encrypted IMAP/SMTP credential storage
- authorized email pattern management
- matching tests

Requirements:

- IMAP/SMTP credentials encrypted at rest.
- Authorized addresses and wildcard patterns per client.
- Matching supports exact email and wildcard domain patterns.
- Unmatched senders are supported.
- Forms use Formedible.

Validation:

- Validator reads email config and matching code.
- Validator verifies secret encryption.
- Validator verifies Formedible usage.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

### Phase 10B - IMAP Sync And Exchange Creation

Read:

- `prd.v3.md`
- event engine
- exchange schema/API
- email matching module

Create/modify:

- IMAP sync worker/jobs
- sync state handling
- exchange creation from matched email
- unmatched inbox support
- tests with mocked IMAP payloads

Requirements:

- Sync jobs run through BullMQ.
- Incoming matched emails create exchanges and emit events.
- Unmatched emails are stored for manual linking.
- Loop-prevention header is respected.
- Sync interval is configurable.

Validation:

- Validator reads sync worker code and tests.
- Validator verifies BullMQ usage.
- Validator verifies loop prevention.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

### Phase 10C - SMTP Send And Ticket Reply Threading

Read:

- `prd.v3.md`
- ticket/exchange API
- email config

Create/modify:

- SMTP send module
- ticket comment email send flow
- threading/reply matching logic
- tests with mocked SMTP/thread headers

Requirements:

- Plain-text email sending.
- Outgoing emails include loop-prevention header.
- Ticket comments can be emailed to clients.
- Client replies are matched back to ticket comments using threading headers where available.
- Internal notes can never be sent externally.

Validation:

- Validator reads SMTP and threading code.
- Validator verifies internal note safety.
- Validator verifies loop-prevention header.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

Phase-wide validation for Phase 10:

- Confirm email config, sync, send, exchanges, tickets, and events integrate coherently.
- Confirm secrets remain encrypted.
- Run `pnpm check-types` and `pnpm build`.

## Phase 11 - Billing, Onboarding, Settings, Deployment

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Complete hosted/self-hosted operational foundations.

### Phase 11A - Settings And Onboarding

Read:

- `prd.v3.md`
- user settings schema
- i18n
- AI/email settings

Create/modify:

- onboarding wizard
- settings routes
- theme/locale preferences
- AI/email setup entry points
- Formedible schemas for settings forms

Requirements:

- Onboarding steps: language, AI provider setup, email setup, done.
- AI and email setup steps are skippable.
- Wizard shown only once.
- Theme supports light/dark/system.
- Settings forms use Formedible.

Validation:

- Validator reads onboarding/settings code.
- Validator verifies Formedible usage.
- Validator verifies skippable AI/email steps.
- Validator enforces NO-SLOP.
- Validator runs `pnpm check-types` and `pnpm build`.

### Phase 11B - Stripe Billing

Read:

- `prd.v3.md`
- env schema
- subscription schema
- auth/API middleware

Create/modify:

- billing module
- Stripe checkout/session handling
- Stripe webhook handling
- subscription status checks when billing enabled
- billing settings UI
- tests for env-gated behavior

Requirements:

- Hosted price is `$24/year`.
- Billing is env-gated.
- Self-hosting works without Stripe env vars.
- Billing gates hosted access only when enabled.
- Subscription status stored and updated through Stripe webhooks.

Validation:

- Validator reads billing code and tests.
- Validator verifies self-host path without Stripe.
- Validator verifies price text/metadata uses dollars, not euros.
- Validator enforces NO-SLOP.
- Validator runs tests, `pnpm check-types`, and `pnpm build`.

### Phase 11C - Docker Compose And Dokploy Deployment

Read:

- `prd.v3.md`
- env schema
- existing deployment files if any

Create/modify:

- Dockerfile(s)
- docker-compose for self-host/hosted baseline
- deployment documentation
- env example

Requirements:

- Compose includes app, PostgreSQL, Redis.
- Redis is required for BullMQ.
- Billing/S3/Stripe are optional env-gated integrations.
- Dokploy deployment path is documented.
- No secrets committed.

Validation:

- Validator reads deployment files and docs.
- Validator verifies no secrets.
- Validator verifies Redis and PostgreSQL are present.
- Validator enforces NO-SLOP where applicable.
- Validator runs `pnpm check-types` and `pnpm build`.

Phase-wide validation for Phase 11:

- Confirm onboarding, settings, billing, and deployment align with hosted/self-hosted expectations.
- Confirm self-hosting remains possible without Stripe/S3.
- Run `pnpm check-types` and `pnpm build`.

## Phase 12 - Mobile And Desktop Clients

Type: Multi-sub-phase, sequential sub-phases.

Purpose: Wire existing Expo and Electrobun apps to the core product without overbuilding native-only behavior.

### Phase 12A - Expo Mobile Core CRM

Read:

- `prd.v3.md`
- native app structure
- shared tRPC client setup
- core CRM API

Create/modify:

- mobile navigation
- client/project/ticket/exchange browsing
- core create/edit screens where supported
- Uniwind styling

Requirements:

- Mobile uses Expo and Uniwind.
- Mobile shares the same tRPC API.
- Mobile supports core CRM access and simple edits.
- Mobile does not include full settings, hooks, AI config, billing, or advanced admin flows.
- No org/team/collab features.

Validation:

- Validator reads native code.
- Validator verifies scope limits.
- Validator verifies shared API usage.
- Validator enforces NO-SLOP.
- Validator runs native type checks and repository `pnpm check-types` where possible.

### Phase 12B - Electrobun Desktop Wrapper

Read:

- `prd.v3.md`
- desktop app structure
- web app build output expectations

Create/modify:

- desktop wrapper config as needed
- desktop documentation if missing

Requirements:

- Desktop remains a thin wrapper around web app.
- No native desktop-only features unless required for wrapper functionality.
- Desktop build scripts remain compatible with existing commands.

Validation:

- Validator reads desktop code/config.
- Validator verifies thin-wrapper approach.
- Validator runs relevant desktop type check/build commands and `pnpm check-types`.

Phase-wide validation for Phase 12:

- Confirm mobile and desktop do not fork domain behavior.
- Confirm both use shared APIs/config where appropriate.
- Run `pnpm check-types` and `pnpm build` where feasible.

## Phase 13 - Final Cross-System Validation And Hardening

Type: Sequential single-sub-phase.

Purpose: Ensure all previously built systems cohere.

Read:

- All modified files from prior phases.
- `prd.v3.md`.
- `orchestration-plan.md`.

Create/modify:

- Only fix issues found during validation.
- No new product scope.

Requirements:

- Run full typecheck and build.
- Run full test suite if present.
- Inspect dependency tree/package manifests for banned Vercel AI SDK package/imports.
- Inspect codebase for team/org/collaboration concepts accidentally introduced.
- Inspect app forms for Formedible compliance, excluding Better Auth auth forms.
- Inspect webhook behavior for internal-event mapping and test-mode default.
- Inspect hook write behavior for default loop suppression.
- Inspect AI hook behavior for per-hook write mode.
- Inspect secret handling for encrypted AI/email/webhook secrets.
- Inspect hosted billing price for `$24/year`.

Validation:

- Validator must actually read representative implementation files across every major module.
- Validator must run `pnpm check-types`.
- Validator must run `pnpm build`.
- Validator must run all tests if a test command exists.
- Validator must report PASS only if product constraints and NO-SLOP policy are satisfied.

## Recommended Subagent Types

Use these agent types when dispatching, adapting as needed:

- `explore` for Phase 0 audit.
- `typescript-pro` for domain types, env, schema typing, API contracts.
- `backend-security-coder` for crypto, auth, API keys, webhooks, secrets.
- `backend-security-coder` or `typescript-pro` for event engine, hooks, queueing, and integrations.
- `frontend-developer` for web UI, Formedible integration, mobile screens.
- `ui-ux-designer` only for UX structure/design review, not final code validation.
- `deployment-engineer` for Docker, Dokploy, and deployment files.
- `code-reviewer` for validators when no more specific validator is needed.
- `architect-review` for phase-wide validators on multi-sub-phase phases.

## Standard Implementer Dispatch Template

Use this structure for every implementer:

```text
You are the Implementer for [Phase/Sub-phase].

Read these files first:
[complete list]

Requirements from orchestration-plan.md:
[paste complete relevant phase/sub-phase requirements]

Create/modify:
[complete list]

Boundaries:
- Implement only this sub-phase.
- Do not validate your own work beyond gatekeeping commands.
- Do not start the dev server.
- Do not introduce out-of-scope product concepts.
- Use TDD vertical slices for code-bearing work.
- Do not write all tests first and then all implementation.

NO-SLOP POLICY (MANDATORY):
[paste mandatory NO-SLOP policy]

TDD POLICY (MANDATORY FOR CODE-BEARING WORK):
- Write one behavior test for one observable capability.
- Run it and confirm it fails for the expected reason.
- Write the minimal implementation needed to pass that test.
- Run the test and confirm it passes.
- Repeat for the next behavior.
- Refactor only after tests are green.
- Test through public interfaces, not private implementation details.
- If no test command exists for a touched package that needs behavior tests, add minimal project-consistent test setup first.

Gatekeeping:
- Run required tests/checks for touched package(s).
- Run pnpm check-types.
- Run pnpm build unless impossible; if impossible, explain exactly why.
- Fix all errors before reporting done.

Final report:
- Files created/modified.
- TDD evidence: behaviors tested, RED command/result, GREEN command/result, refactor/test rerun if applicable.
- Commands run and results.
- Any residual risk.
```

## Standard Validator Dispatch Template

Use this structure for every validator:

```text
You are the Validator for [Phase/Sub-phase].

You must ACTUALLY READ all created/modified files. Running commands is not enough.

Files to review:
[complete list from implementer report]

Requirements from orchestration-plan.md:
[paste complete relevant phase/sub-phase requirements]

Validation criteria:
- Verify every requirement is met.
- Enforce the NO-SLOP policy strictly.
- Enforce the TDD policy strictly for code-bearing work.
- Verify tests cover observable behavior through public interfaces, not private implementation details.
- Verify implementer provided RED/GREEN evidence, or justified a documentation/deployment-only exemption.
- Verify project constraints from prd.v3.md are not violated.
- Run relevant tests/checks.
- Run pnpm check-types.
- Run pnpm build unless impossible; if impossible, explain exactly why.

NO-SLOP POLICY TO ENFORCE:
[paste mandatory NO-SLOP policy]

TDD POLICY TO ENFORCE:
- Code-bearing work must be delivered through vertical RED/GREEN slices.
- Tests must verify behavior through public interfaces.
- Reject horizontal test batches followed by broad implementation batches.
- Reject tests coupled to private implementation details.
- Reject missing RED/GREEN evidence unless the sub-phase is genuinely documentation-only, deployment-only, or otherwise not meaningfully automatable.

Final report:
- PASS or FAIL.
- If FAIL, list every issue with file paths and line references.
- Include commands run and results.
```

## Standard Fixer Dispatch Template

Use this structure for every fixer:

```text
You are the Fixer for [Phase/Sub-phase].

Fix ALL validator issues at once. Do not fix only one issue.

Validator report:
[paste complete validator report]

Requirements from orchestration-plan.md:
[paste complete relevant phase/sub-phase requirements]

NO-SLOP POLICY (MANDATORY):
[paste mandatory NO-SLOP policy]

TDD POLICY (MANDATORY FOR CODE-BEARING FIXES):
- If fixing untested behavior, add or adjust one behavior test first and confirm it fails for the expected reason.
- Implement the minimal fix to pass.
- Run the focused test, then relevant package tests, then gatekeeping commands.
- Do not replace behavior tests with private implementation tests.

Gatekeeping:
- Run required tests/checks for touched package(s).
- Run pnpm check-types.
- Run pnpm build unless impossible; if impossible, explain exactly why.
- Fix all errors before reporting done.

Final report:
- Files modified.
- Issues fixed.
- TDD evidence for behavioral fixes.
- Commands run and results.
- Any residual risk.
```

## Final Success Criteria

Execution is complete only when:

- All phases pass validation.
- `pnpm check-types` passes.
- `pnpm build` passes or every impossible build target is explicitly justified by environment constraints.
- Tests pass where implemented.
- Code-bearing phases include behavior tests created through TDD vertical slices, with RED/GREEN evidence in implementer/fixer reports.
- Tests verify public behavior rather than private implementation details.
- No Vercel AI SDK dependency/import exists.
- TanStack AI is the AI integration path.
- Formedible is used for all app forms except Better Auth auth forms.
- No organization/team/collaboration concepts exist.
- Incoming webhooks map to internal events and start in test mode.
- Hook-driven writes suppress downstream hook automation by default.
- AI hook write behavior is configurable per hook.
- Secrets are encrypted at rest.
- Hosted billing uses `$24/year` and is env-gated.
- Docker-compose deployment includes PostgreSQL and Redis.
