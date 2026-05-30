# DCRM2 Codebase Exploration Map

**Generated:** 2026-05-30  
**Session:** session-20260530-111722

---

## 1. Project Structure Overview

```
DCRM2/
├── apps/
│   ├── web/            # TanStack Start (Vite + React 19 + Router + React Query)
│   ├── native/         # Expo + Uniwind (mobile)
│   └── desktop/        # Electrobun wrapper around web build
├── packages/
│   ├── api/            # tRPC routers, procedures, context
│   ├── auth/           # Better Auth config, session handling
│   ├── db/             # Drizzle schema, migrations, PostgreSQL
│   ├── domain/         # Shared domain types & business logic
│   ├── events/         # Event engine (emitter, executor, hooks, queue)
│   ├── ai/             # AI integration (chat, adapters, hook executor)
│   ├── email/          # IMAP sync, SMTP, threading, matching
│   ├── webhooks/       # Incoming/outgoing webhook processing
│   ├── storage/        # File storage (S3, local)
│   ├── billing/        # Stripe billing & subscriptions
│   ├── crypto/         # Encryption utilities
│   ├── i18n/           # Internationalization
│   ├── env/            # Environment variable validation
│   ├── ui/             # shadcn/base-ui + CVA + Tailwind CSS v4 (EXCLUDED)
│   └── config/         # Shared TS configs (EXCLUDED)
├── Dockerfile
├── docker-compose.yml
└── docs/deployment.md
```

### Excluded from Review
- `node_modules/`, `dist/`, `build/`, `.next/`, `.vinx/`, `.turbo/`
- `packages/ui/src/components/` — shadcn components (third-party deps)
- `packages/ui/src/components/formedible/` — Formedible lib (dependency)
- `packages/ui/src/lib/utils.ts` — shadcn cn() utility
- `packages/config/` — shared TS configs, no logic
- `*.generated.*` — e.g., `routeTree.gen.ts`
- `vitest.config.ts`, `drizzle.config.ts`, `vite.config.ts`, `electrobun.config.ts` — config with no logic
- `pnpm-lock.yaml`, `package.json`, `tsconfig.json` — no logic
- `*.d.ts` from deps — type declarations (uniwind-env.d.ts, aws-sdk.d.ts, three.d.ts)
- `src/` (root) — empty directory

### Technology Stack
- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** TanStack Start (Vite + React 19 + TanStack Router + React Query)
- **API:** tRPC v11 (batched HTTP)
- **Database:** Drizzle ORM + PostgreSQL 17
- **Auth:** Better Auth (session + API key)
- **AI:** Multi-provider (OpenAI, Anthropic, Google, OpenRouter) with structured output
- **Email:** IMAP sync + SMTP + threading + matching
- **Storage:** S3-compatible or local filesystem
- **Billing:** Stripe
- **Desktop:** Electrobun (wrapper around web build)
- **Mobile:** Expo + Uniwind

---

## 2. Reviewable Files Grouped into Clusters

### Cluster 1: API Infrastructure & tRPC Setup
**What:** Core tRPC initialization, auth-aware procedures, request context creation, storage backend factory, and router aggregation.
**Dependencies:** `@DCRM/auth`, `@DCRM/storage`, `@DCRM/env`
**Review Focus:** Security (auth middleware), data flow (context propagation), architecture

| # | File |
|---|------|
| 1 | `packages/api/src/index.ts` |
| 2 | `packages/api/src/context.ts` |
| 3 | `packages/api/src/storage.ts` |
| 4 | `packages/api/src/routers/index.ts` |

---

### Cluster 2: Database Schema
**What:** Drizzle ORM schema definitions for all tables (auth, CRM entities, automation). Schema aggregation and exports.
**Dependencies:** `drizzle-orm`, `@DCRM/env`
**Review Focus:** Data integrity (constraints, relations), schema correctness, migration readiness

| # | File |
|---|------|
| 1 | `packages/db/src/index.ts` |
| 2 | `packages/db/src/schema/index.ts` |
| 3 | `packages/db/src/schema/auth.ts` |
| 4 | `packages/db/src/schema/crm.ts` |
| 5 | `packages/db/src/schema/automation.ts` |
| 6 | `packages/db/__tests__/crm-schema.test.ts` |
| 7 | `packages/db/__tests__/automation-schema.test.ts` |

---

### Cluster 3: Authentication, Crypto & Environment
**What:** Better Auth configuration, API key generation/validation, auth resolution, encryption utilities, and environment variable validation (server/web/native).
**Dependencies:** `better-auth`, `@DCRM/env`, `@DCRM/db`
**Review Focus:** Security (credential handling, encryption, API key strength), input validation, secret management

| # | File |
|---|------|
| 1 | `packages/auth/src/index.ts` |
| 2 | `packages/auth/src/api-key.ts` |
| 3 | `packages/auth/src/resolve-auth.ts` |
| 4 | `packages/auth/src/types.ts` |
| 5 | `packages/auth/__tests__/api-key.test.ts` |
| 6 | `packages/crypto/src/index.ts` |
| 7 | `packages/crypto/src/encrypt.ts` |
| 8 | `packages/crypto/__tests__/encrypt.test.ts` |
| 9 | `packages/env/src/server.ts` |
| 10 | `packages/env/src/web.ts` |
| 11 | `packages/env/src/native.ts` |
| 12 | `packages/env/__tests__/server.test.ts` |

---

### Cluster 4: Domain Types — CRM Entities
**What:** Domain type definitions and business logic for core CRM entities (lead, project, ticket, exchange, custom fields). Zod schemas, enums, type guards.
**Dependencies:** `zod`
**Review Focus:** Type correctness, schema completeness, business rule enforcement

| # | File |
|---|------|
| 1 | `packages/domain/src/index.ts` |
| 2 | `packages/domain/src/lead.ts` |
| 3 | `packages/domain/src/project.ts` |
| 4 | `packages/domain/src/ticket.ts` |
| 5 | `packages/domain/src/exchange.ts` |
| 6 | `packages/domain/src/custom-field.ts` |
| 7 | `packages/domain/__tests__/lead.test.ts` |
| 8 | `packages/domain/__tests__/project.test.ts` |
| 9 | `packages/domain/__tests__/ticket.test.ts` |
| 10 | `packages/domain/__tests__/exchange.test.ts` |
| 11 | `packages/domain/__tests__/custom-field.test.ts` |

---

### Cluster 5: Domain Types — Infrastructure & Services
**What:** Domain type definitions for cross-cutting concerns (billing, attachments, webhooks, AI, hooks, events).
**Dependencies:** `zod`
**Review Focus:** Type correctness, schema completeness, cross-entity consistency

| # | File |
|---|------|
| 1 | `packages/domain/src/billing.ts` |
| 2 | `packages/domain/src/attachment.ts` |
| 3 | `packages/domain/src/webhook.ts` |
| 4 | `packages/domain/src/ai.ts` |
| 5 | `packages/domain/src/hook.ts` |
| 6 | `packages/domain/src/event.ts` |
| 7 | `packages/domain/__tests__/billing.test.ts` |
| 8 | `packages/domain/__tests__/attachment.test.ts` |
| 9 | `packages/domain/__tests__/webhook.test.ts` |
| 10 | `packages/domain/__tests__/ai.test.ts` |
| 11 | `packages/domain/__tests__/hook.test.ts` |
| 12 | `packages/domain/__tests__/event.test.ts` |

---

### Cluster 6: Event Engine
**What:** Event-driven architecture core — typed event emission, hook execution, provenance tracking, queue management, retry logic, and hook resolution.
**Dependencies:** `@DCRM/domain`, `@DCRM/db`
**Review Focus:** Reliability (retry/queue), data flow (event propagation), correctness (hook resolution), provenance

| # | File |
|---|------|
| 1 | `packages/events/src/index.ts` |
| 2 | `packages/events/src/emitter.ts` |
| 3 | `packages/events/src/executor.ts` |
| 4 | `packages/events/src/event-types.ts` |
| 5 | `packages/events/src/hook-resolver.ts` |
| 6 | `packages/events/src/provenance.ts` |
| 7 | `packages/events/src/queue.ts` |
| 8 | `packages/events/src/retry.ts` |
| 9 | `packages/events/__tests__/provenance.test.ts` |
| 10 | `packages/events/__tests__/hook-execution.test.ts` |
| 11 | `packages/events/__tests__/emitter.test.ts` |

---

### Cluster 7: AI Core Engine & Providers
**What:** AI chat engine, provider management, structured output generation, prompt templates, and AI tools registry.
**Dependencies:** `@DCRM/domain`, `@DCRM/db`, `@DCRM/env`
**Review Focus:** Security (prompt injection), data flow (AI request/response), error handling, provider abstraction correctness

| # | File |
|---|------|
| 1 | `packages/ai/src/index.ts` |
| 2 | `packages/ai/src/chat.ts` |
| 3 | `packages/ai/src/types.ts` |
| 4 | `packages/ai/src/provider-manager.ts` |
| 5 | `packages/ai/src/structured-output.ts` |
| 6 | `packages/ai/src/tools/index.ts` |
| 7 | `packages/ai/src/templates/index.ts` |
| 8 | `packages/ai/__tests__/chat.test.ts` |
| 9 | `packages/ai/__tests__/provider.test.ts` |
| 10 | `packages/ai/__tests__/structured-output.test.ts` |

---

### Cluster 8: AI Adapters & Hook Execution
**What:** LLM provider adapters (OpenAI, Anthropic, Google, OpenRouter) and AI hook execution engine with field mapping.
**Dependencies:** `@DCRM/domain`, `@DCRM/ai` (core)
**Review Focus:** API integration correctness, error handling, adapter consistency, security (API key handling)

| # | File |
|---|------|
| 1 | `packages/ai/src/hook-executor.ts` |
| 2 | `packages/ai/src/field-mapper.ts` |
| 3 | `packages/ai/src/adapters/google.ts` |
| 4 | `packages/ai/src/adapters/anthropic.ts` |
| 5 | `packages/ai/src/adapters/openai.ts` |
| 6 | `packages/ai/src/adapters/openrouter.ts` |
| 7 | `packages/ai/__tests__/hook-executor.test.ts` |

---

### Cluster 9: Email Processing
**What:** IMAP email sync, SMTP sending, email threading, email-to-entity matching, unmatched email handling, and email account configuration.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/env`
**Review Focus:** Security (credential handling), data flow (email parsing/matching), reliability (sync), error handling

| # | File |
|---|------|
| 1 | `packages/email/src/index.ts` |
| 2 | `packages/email/src/imap-sync.ts` |
| 3 | `packages/email/src/smtp.ts` |
| 4 | `packages/email/src/threading.ts` |
| 5 | `packages/email/src/matching.ts` |
| 6 | `packages/email/src/unmatched.ts` |
| 7 | `packages/email/src/config.ts` |
| 8 | `packages/email/__tests__/threading.test.ts` |
| 9 | `packages/email/__tests__/smtp.test.ts` |
| 10 | `packages/email/__tests__/imap-sync.test.ts` |
| 11 | `packages/email/__tests__/matching.test.ts` |

---

### Cluster 10: Webhook Processing
**What:** Incoming webhook reception, outgoing webhook dispatch, payload mapping, and webhook authentication.
**Dependencies:** `@DCRM/domain`, `@DCRM/db`, `@DCRM/events`
**Review Focus:** Security (webhook auth/signatures), data flow (payload mapping), reliability (delivery)

| # | File |
|---|------|
| 1 | `packages/webhooks/src/index.ts` |
| 2 | `packages/webhooks/src/incoming.ts` |
| 3 | `packages/webhooks/src/outgoing.ts` |
| 4 | `packages/webhooks/src/mapper.ts` |
| 5 | `packages/webhooks/src/auth.ts` |
| 6 | `packages/webhooks/__tests__/incoming.test.ts` |
| 7 | `packages/webhooks/__tests__/outgoing.test.ts` |

---

### Cluster 11: File Storage
**What:** Storage abstraction layer with S3-compatible and local filesystem backends. File upload/download/delete operations.
**Dependencies:** `@DCRM/env`, `@aws-sdk/client-s3`
**Review Focus:** Security (path traversal, access control), data flow (upload/download), error handling

| # | File |
|---|------|
| 1 | `packages/storage/src/index.ts` |
| 2 | `packages/storage/src/storage.ts` |
| 3 | `packages/storage/src/s3.ts` |
| 4 | `packages/storage/src/local.ts` |
| 5 | `packages/storage/src/types.ts` |
| 6 | `packages/storage/__tests__/storage.test.ts` |

---

### Cluster 12: Billing & Subscriptions
**What:** Stripe integration for subscription management, billing middleware, and subscription status checking.
**Dependencies:** `stripe`, `@DCRM/domain`, `@DCRM/db`, `@DCRM/env`
**Review Focus:** Security (Stripe webhook signatures), data flow (subscription state), financial correctness

| # | File |
|---|------|
| 1 | `packages/billing/src/index.ts` |
| 2 | `packages/billing/src/subscription.ts` |
| 3 | `packages/billing/src/stripe.ts` |
| 4 | `packages/billing/src/middleware.ts` |
| 5 | `packages/billing/__tests__/billing.test.ts` |

---

### Cluster 13: Internationalization
**What:** Lightweight i18n system with locale management, translation dictionaries, string interpolation, and English locale data.
**Dependencies:** (none — pure utility)
**Review Focus:** Logic (interpolation, locale fallback), completeness

| # | File |
|---|------|
| 1 | `packages/i18n/src/index.ts` |
| 2 | `packages/i18n/src/i18n.ts` |
| 3 | `packages/i18n/src/types.ts` |
| 4 | `packages/i18n/src/locales/en.ts` |
| 5 | `packages/i18n/src/__tests__/i18n.test.ts` |

---

### Cluster 14: API Router — Client CRUD
**What:** Full CRUD operations for clients — create, read, update, soft-delete, restore, list, search. Input validation schemas and tests.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`
**Review Focus:** Security (userId scoping), data flow (CRUD operations), input validation, query efficiency

| # | File |
|---|------|
| 1 | `packages/api/src/routers/client/index.ts` |
| 2 | `packages/api/src/routers/client/create.ts` |
| 3 | `packages/api/src/routers/client/read.ts` |
| 4 | `packages/api/src/routers/client/update.ts` |
| 5 | `packages/api/src/routers/client/soft-delete.ts` |
| 6 | `packages/api/src/routers/client/restore.ts` |
| 7 | `packages/api/src/routers/client/list.ts` |
| 8 | `packages/api/src/routers/client/search.ts` |
| 9 | `packages/api/src/routers/client/schemas.ts` |
| 10 | `packages/api/src/routers/client/procedures.test.ts` |
| 11 | `packages/api/src/routers/client/schemas.test.ts` |
| 12 | `packages/api/src/routers/client/infrastructure.test.ts` |

---

### Cluster 15: API Router — Lead CRUD
**What:** Full CRUD operations for leads — create, read, update, update-stage, soft-delete, restore, list, search. Includes lead-to-client conversion.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`, `@DCRM/events`
**Review Focus:** Security (userId scoping), business logic (stage transitions, conversion), input validation

| # | File |
|---|------|
| 1 | `packages/api/src/routers/lead/index.ts` |
| 2 | `packages/api/src/routers/lead/create.ts` |
| 3 | `packages/api/src/routers/lead/read.ts` |
| 4 | `packages/api/src/routers/lead/update.ts` |
| 5 | `packages/api/src/routers/lead/update-stage.ts` |
| 6 | `packages/api/src/routers/lead/soft-delete.ts` |
| 7 | `packages/api/src/routers/lead/restore.ts` |
| 8 | `packages/api/src/routers/lead/list.ts` |
| 9 | `packages/api/src/routers/lead/search.ts` |
| 10 | `packages/api/src/routers/lead/schemas.ts` |
| 11 | `packages/api/src/routers/lead/convert.ts` |
| 12 | `packages/api/src/routers/lead/procedures.test.ts` |

---

### Cluster 16: API Router — Project CRUD
**What:** Full CRUD operations for projects — create, read, update, soft-delete, restore, list, search, upcoming deadlines.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`
**Review Focus:** Security (userId scoping), data flow, input validation, query efficiency

| # | File |
|---|------|
| 1 | `packages/api/src/routers/project/index.ts` |
| 2 | `packages/api/src/routers/project/create.ts` |
| 3 | `packages/api/src/routers/project/read.ts` |
| 4 | `packages/api/src/routers/project/update.ts` |
| 5 | `packages/api/src/routers/project/soft-delete.ts` |
| 6 | `packages/api/src/routers/project/restore.ts` |
| 7 | `packages/api/src/routers/project/list.ts` |
| 8 | `packages/api/src/routers/project/search.ts` |
| 9 | `packages/api/src/routers/project/upcoming-deadlines.ts` |
| 10 | `packages/api/src/routers/project/schemas.ts` |
| 11 | `packages/api/src/routers/project/procedures.test.ts` |
| 12 | `packages/api/src/routers/project/schemas.test.ts` |

---

### Cluster 17: API Router — Ticket CRUD
**What:** Full CRUD operations for tickets — create, read, update, soft-delete, restore, list, search, upcoming deadlines.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`
**Review Focus:** Security (userId scoping), data flow, input validation, query efficiency

| # | File |
|---|------|
| 1 | `packages/api/src/routers/ticket/index.ts` |
| 2 | `packages/api/src/routers/ticket/create.ts` |
| 3 | `packages/api/src/routers/ticket/read.ts` |
| 4 | `packages/api/src/routers/ticket/update.ts` |
| 5 | `packages/api/src/routers/ticket/soft-delete.ts` |
| 6 | `packages/api/src/routers/ticket/restore.ts` |
| 7 | `packages/api/src/routers/ticket/list.ts` |
| 8 | `packages/api/src/routers/ticket/search.ts` |
| 9 | `packages/api/src/routers/ticket/upcoming-deadlines.ts` |
| 10 | `packages/api/src/routers/ticket/schemas.ts` |
| 11 | `packages/api/src/routers/ticket/procedures.test.ts` |
| 12 | `packages/api/src/routers/ticket/schemas.test.ts` |

---

### Cluster 18: API Router — Exchange & Communication
**What:** Exchange (email/message) CRUD operations — create, read, list, send-email, timeline. Tests for procedures and schemas.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`, `@DCRM/email`, `@DCRM/events`
**Review Focus:** Security (email sending auth), data flow (exchange threading), input validation

| # | File |
|---|------|
| 1 | `packages/api/src/routers/exchange/index.ts` |
| 2 | `packages/api/src/routers/exchange/create.ts` |
| 3 | `packages/api/src/routers/exchange/read.ts` |
| 4 | `packages/api/src/routers/exchange/list.ts` |
| 5 | `packages/api/src/routers/exchange/send-email.ts` |
| 6 | `packages/api/src/routers/exchange/timeline.ts` |
| 7 | `packages/api/src/routers/exchange/schemas.ts` |
| 8 | `packages/api/src/routers/exchange/procedures.test.ts` |
| 9 | `packages/api/src/routers/exchange/schemas.test.ts` |

---

### Cluster 19: API Router — Email Account Management
**What:** Email account CRUD, authorized address management (add/remove/list), and email account configuration.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`, `@DCRM/crypto`
**Review Focus:** Security (credential storage/encryption), input validation, authorized address handling

| # | File |
|---|------|
| 1 | `packages/api/src/routers/email-account/index.ts` |
| 2 | `packages/api/src/routers/email-account/create.ts` |
| 3 | `packages/api/src/routers/email-account/read.ts` |
| 4 | `packages/api/src/routers/email-account/update.ts` |
| 5 | `packages/api/src/routers/email-account/delete.ts` |
| 6 | `packages/api/src/routers/email-account/list.ts` |
| 7 | `packages/api/src/routers/email-account/add-authorized-address.ts` |
| 8 | `packages/api/src/routers/email-account/remove-authorized-address.ts` |
| 9 | `packages/api/src/routers/email-account/list-authorized-addresses.ts` |
| 10 | `packages/api/src/routers/email-account/schemas.ts` |

---

### Cluster 20: API Router — Outgoing Webhooks
**What:** Outgoing webhook CRUD — create, read, update, delete, list. Auth builder for webhook signatures.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`, `@DCRM/webhooks`
**Review Focus:** Security (webhook URL validation, auth builder), input validation

| # | File |
|---|------|
| 1 | `packages/api/src/routers/webhook/index.ts` |
| 2 | `packages/api/src/routers/webhook/create.ts` |
| 3 | `packages/api/src/routers/webhook/read.ts` |
| 4 | `packages/api/src/routers/webhook/update.ts` |
| 5 | `packages/api/src/routers/webhook/delete.ts` |
| 6 | `packages/api/src/routers/webhook/list.ts` |
| 7 | `packages/api/src/routers/webhook/schemas.ts` |
| 8 | `packages/api/src/routers/webhook/auth-builder.ts` |

---

### Cluster 21: API Router — Incoming Webhooks
**What:** Incoming webhook CRUD, receiver endpoint, and mapping test endpoint. Handles external webhook reception and payload mapping.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/webhooks`, `@DCRM/events`
**Review Focus:** Security (unauthenticated receiver endpoint), data flow (payload mapping), input validation

| # | File |
|---|------|
| 1 | `packages/api/src/routers/incoming-webhook/index.ts` |
| 2 | `packages/api/src/routers/incoming-webhook/create.ts` |
| 3 | `packages/api/src/routers/incoming-webhook/read.ts` |
| 4 | `packages/api/src/routers/incoming-webhook/update.ts` |
| 5 | `packages/api/src/routers/incoming-webhook/delete.ts` |
| 6 | `packages/api/src/routers/incoming-webhook/list.ts` |
| 7 | `packages/api/src/routers/incoming-webhook/receiver.ts` |
| 8 | `packages/api/src/routers/incoming-webhook/test-mapping.ts` |
| 9 | `packages/api/src/routers/incoming-webhook/schemas.ts` |

---

### Cluster 22: API Router — AI Chat & Provider Management
**What:** AI chat message sending, history listing, clearing, data access layer, plus AI provider CRUD.
**Dependencies:** `@DCRM/db`, `@DCRM/ai`, `@DCRM/auth`
**Review Focus:** Security (AI provider API key storage), data flow (chat messages), input validation

| # | File |
|---|------|
| 1 | `packages/api/src/routers/ai-chat/index.ts` |
| 2 | `packages/api/src/routers/ai-chat/send-message.ts` |
| 3 | `packages/api/src/routers/ai-chat/data-access.ts` |
| 4 | `packages/api/src/routers/ai-chat/clear-history.ts` |
| 5 | `packages/api/src/routers/ai-chat/list-messages.ts` |
| 6 | `packages/api/src/routers/ai-chat/schemas.ts` |
| 7 | `packages/api/src/routers/ai-provider/index.ts` |
| 8 | `packages/api/src/routers/ai-provider/create.ts` |
| 9 | `packages/api/src/routers/ai-provider/read.ts` |
| 10 | `packages/api/src/routers/ai-provider/update.ts` |
| 11 | `packages/api/src/routers/ai-provider/delete.ts` |
| 12 | `packages/api/src/routers/ai-provider/list.ts` |
| 13 | `packages/api/src/routers/ai-provider/schemas.ts` |

---

### Cluster 23: API Router — Data Import & Export
**What:** CSV parsing, client import, full data export, export listing, CSV generation utilities.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`, `@DCRM/storage`
**Review Focus:** Security (file upload handling), data flow (CSV parsing/generation), input validation, resource limits

| # | File |
|---|------|
| 1 | `packages/api/src/routers/export/index.ts` |
| 2 | `packages/api/src/routers/export/full-data-export.ts` |
| 3 | `packages/api/src/routers/export/export-list.ts` |
| 4 | `packages/api/src/routers/export/csv-utils.ts` |
| 5 | `packages/api/src/routers/export/schemas.ts` |
| 6 | `packages/api/src/routers/export/csv-utils.test.ts` |
| 7 | `packages/api/src/routers/import/index.ts` |
| 8 | `packages/api/src/routers/import/import-clients.ts` |
| 9 | `packages/api/src/routers/import/parse-csv.ts` |
| 10 | `packages/api/src/routers/import/schemas.ts` |
| 11 | `packages/api/src/routers/import/procedures.test.ts` |

---

### Cluster 24: API Router — Tags & Entity Tags
**What:** Tag CRUD (create, read, update, delete, list) and entity-tag association (attach, detach). Cross-entity tagging system.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`
**Review Focus:** Data flow (entity-tag association), input validation, userId scoping

| # | File |
|---|------|
| 1 | `packages/api/src/routers/tag/index.ts` |
| 2 | `packages/api/src/routers/tag/create.ts` |
| 3 | `packages/api/src/routers/tag/read.ts` |
| 4 | `packages/api/src/routers/tag/update.ts` |
| 5 | `packages/api/src/routers/tag/delete.ts` |
| 6 | `packages/api/src/routers/tag/list.ts` |
| 7 | `packages/api/src/routers/tag/schemas.ts` |
| 8 | `packages/api/src/routers/tag/schemas.test.ts` |
| 9 | `packages/api/src/routers/entity-tag/index.ts` |
| 10 | `packages/api/src/routers/entity-tag/attach.ts` |
| 11 | `packages/api/src/routers/entity-tag/detach.ts` |
| 12 | `packages/api/src/routers/entity-tag/schemas.ts` |

---

### Cluster 25: API Router — Notifications & Settings
**What:** Notification listing and mark-read operations. User settings management — theme, locale, onboarding completion.
**Dependencies:** `@DCRM/db`, `@DCRM/auth`, `@DCRM/i18n`
**Review Focus:** Data flow (settings persistence), input validation, userId scoping

| # | File |
|---|------|
| 1 | `packages/api/src/routers/notification/index.ts` |
| 2 | `packages/api/src/routers/notification/list.ts` |
| 3 | `packages/api/src/routers/notification/mark-read.ts` |
| 4 | `packages/api/src/routers/notification/mark-all-read.ts` |
| 5 | `packages/api/src/routers/notification/schemas.ts` |
| 6 | `packages/api/src/routers/settings/index.ts` |
| 7 | `packages/api/src/routers/settings/get-settings.ts` |
| 8 | `packages/api/src/routers/settings/update-theme.ts` |
| 9 | `packages/api/src/routers/settings/update-locale.ts` |
| 10 | `packages/api/src/routers/settings/complete-onboarding.ts` |
| 11 | `packages/api/src/routers/settings/schemas.ts` |

---

### Cluster 26: API Router — Search & Attachments
**What:** Global search across entities. File attachment upload, download, delete, read, and list operations.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`, `@DCRM/storage`
**Review Focus:** Security (file upload validation, path traversal), data flow (search indexing), input validation

| # | File |
|---|------|
| 1 | `packages/api/src/routers/search/index.ts` |
| 2 | `packages/api/src/routers/search/global.ts` |
| 3 | `packages/api/src/routers/search/schemas.ts` |
| 4 | `packages/api/src/routers/search/schemas.test.ts` |
| 5 | `packages/api/src/routers/attachment/index.ts` |
| 6 | `packages/api/src/routers/attachment/upload.ts` |
| 7 | `packages/api/src/routers/attachment/download.ts` |
| 8 | `packages/api/src/routers/attachment/delete.ts` |
| 9 | `packages/api/src/routers/attachment/read.ts` |
| 10 | `packages/api/src/routers/attachment/list.ts` |
| 11 | `packages/api/src/routers/attachment/schemas.ts` |

---

### Cluster 27: API Router — Hooks & Billing
**What:** Hook CRUD, execution listing, insight management (list/accept). Billing router aggregation.
**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/auth`, `@DCRM/events`, `@DCRM/billing`
**Review Focus:** Security (hook execution), data flow (insights), input validation, billing integration

| # | File |
|---|------|
| 1 | `packages/api/src/routers/hook/index.ts` |
| 2 | `packages/api/src/routers/hook/create.ts` |
| 3 | `packages/api/src/routers/hook/read.ts` |
| 4 | `packages/api/src/routers/hook/update.ts` |
| 5 | `packages/api/src/routers/hook/delete.ts` |
| 6 | `packages/api/src/routers/hook/list.ts` |
| 7 | `packages/api/src/routers/hook/list-executions.ts` |
| 8 | `packages/api/src/routers/hook/list-insights.ts` |
| 9 | `packages/api/src/routers/hook/accept-insight.ts` |
| 10 | `packages/api/src/routers/hook/schemas.ts` |
| 11 | `packages/api/src/routers/billing/index.ts` |

---

### Cluster 28: Web App — Shell, Routing & Auth
**What:** Root route, app layout, authenticated layout, login page, router initialization (tRPC + React Query), auth middleware, API route handlers (auth, tRPC, webhook receiver).
**Dependencies:** `@DCRM/api`, `@DCRM/auth`, `@tanstack/react-router`, `@tanstack/react-query`, `@trpc/client`
**Review Focus:** Security (middleware, auth redirects), data flow (tRPC wiring), architecture

| # | File |
|---|------|
| 1 | `apps/web/src/routes/__root.tsx` |
| 2 | `apps/web/src/routes/index.tsx` |
| 3 | `apps/web/src/routes/_authenticated.tsx` |
| 4 | `apps/web/src/routes/login.tsx` |
| 5 | `apps/web/src/router.tsx` |
| 6 | `apps/web/src/middleware/auth.ts` |
| 7 | `apps/web/src/functions/get-user.ts` |
| 8 | `apps/web/src/lib/auth-client.ts` |
| 9 | `apps/web/src/utils/trpc.ts` |
| 10 | `apps/web/src/routes/api/auth/$.ts` |
| 11 | `apps/web/src/routes/api/trpc/$.ts` |
| 12 | `apps/web/src/routes/api/webhook/$token.ts` |

---

### Cluster 29: Web App — Shared Components
**What:** Reusable UI components — header, loader, user menu, sign-in/sign-up forms, global search, notification bell, exchange timeline.
**Dependencies:** `@DCRM/ui`, `@DCRM/api`, `@DCRM/auth`
**Review Focus:** UI logic, data flow (tRPC queries/mutations), accessibility, error handling

| # | File |
|---|------|
| 1 | `apps/web/src/components/header.tsx` |
| 2 | `apps/web/src/components/loader.tsx` |
| 3 | `apps/web/src/components/user-menu.tsx` |
| 4 | `apps/web/src/components/sign-in-form.tsx` |
| 5 | `apps/web/src/components/sign-up-form.tsx` |
| 6 | `apps/web/src/components/global-search.tsx` |
| 7 | `apps/web/src/components/notification-bell.tsx` |
| 8 | `apps/web/src/components/exchange-timeline.tsx` |

---

### Cluster 30: Web App — Client & Lead Pages
**What:** All client and lead route pages — listing, creation, detail view, editing, and lead-to-client conversion.
**Dependencies:** `@DCRM/api`, `@DCRM/ui`, form schemas
**Review Focus:** Data flow (CRUD via tRPC), form handling, error states, navigation

| # | File |
|---|------|
| 1 | `apps/web/src/routes/_authenticated/clients/index.tsx` |
| 2 | `apps/web/src/routes/_authenticated/clients/create.tsx` |
| 3 | `apps/web/src/routes/_authenticated/clients/$clientId.tsx` |
| 4 | `apps/web/src/routes/_authenticated/clients/$clientId.edit.tsx` |
| 5 | `apps/web/src/routes/_authenticated/leads/index.tsx` |
| 6 | `apps/web/src/routes/_authenticated/leads/create.tsx` |
| 7 | `apps/web/src/routes/_authenticated/leads/$leadId.tsx` |
| 8 | `apps/web/src/routes/_authenticated/leads/$leadId.edit.tsx` |
| 9 | `apps/web/src/routes/_authenticated/leads/$leadId.convert.tsx` |

---

### Cluster 31: Web App — Project, Ticket, Dashboard & AI Chat
**What:** Project and ticket pages (including nested project>tickets), global tickets, dashboard overview, and AI chat interface.
**Dependencies:** `@DCRM/api`, `@DCRM/ui`, form schemas
**Review Focus:** Data flow (CRUD via tRPC), form handling, nested routing, AI chat interaction

| # | File |
|---|------|
| 1 | `apps/web/src/routes/_authenticated/dashboard.tsx` |
| 2 | `apps/web/src/routes/_authenticated/ai-chat.tsx` |
| 3 | `apps/web/src/routes/_authenticated/projects/index.tsx` |
| 4 | `apps/web/src/routes/_authenticated/projects/create.tsx` |
| 5 | `apps/web/src/routes/_authenticated/projects/$projectId.tsx` |
| 6 | `apps/web/src/routes/_authenticated/projects/$projectId.edit.tsx` |
| 7 | `apps/web/src/routes/_authenticated/projects/$projectId/tickets/index.tsx` |
| 8 | `apps/web/src/routes/_authenticated/projects/$projectId/tickets/create.tsx` |
| 9 | `apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.tsx` |
| 10 | `apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.edit.tsx` |
| 11 | `apps/web/src/routes/_authenticated/tickets/index.tsx` |

---

### Cluster 32: Web App — Settings & Onboarding
**What:** Settings pages (appearance, AI providers, email, incoming webhooks) and onboarding flow (language, AI setup, email setup).
**Dependencies:** `@DCRM/api`, `@DCRM/ui`, form schemas
**Review Focus:** Data flow (settings persistence), form handling, onboarding flow correctness

| # | File |
|---|------|
| 1 | `apps/web/src/routes/_authenticated/settings.tsx` |
| 2 | `apps/web/src/routes/_authenticated/settings/appearance.tsx` |
| 3 | `apps/web/src/routes/_authenticated/settings/ai-providers.tsx` |
| 4 | `apps/web/src/routes/_authenticated/settings/email.tsx` |
| 5 | `apps/web/src/routes/_authenticated/settings/incoming-webhooks.tsx` |
| 6 | `apps/web/src/routes/_authenticated/onboarding/index.tsx` |
| 7 | `apps/web/src/routes/_authenticated/onboarding/ai-setup.tsx` |
| 8 | `apps/web/src/routes/_authenticated/onboarding/email-setup.tsx` |

---

### Cluster 33: Web App — Form Schemas
**What:** Zod validation schemas for all application forms (lead, client, project, ticket, email account, AI provider, incoming webhook, mapping config, appearance, authorized address).
**Dependencies:** `zod`, `@DCRM/domain`
**Review Focus:** Input validation completeness, Zod 4 correctness, schema alignment with API schemas

| # | File |
|---|------|
| 1 | `apps/web/src/lib/forms/lead-form-schema.ts` |
| 2 | `apps/web/src/lib/forms/client-form-schema.ts` |
| 3 | `apps/web/src/lib/forms/project-form-schema.ts` |
| 4 | `apps/web/src/lib/forms/ticket-form-schema.ts` |
| 5 | `apps/web/src/lib/forms/email-account-form-schema.ts` |
| 6 | `apps/web/src/lib/forms/ai-provider-form-schema.ts` |
| 7 | `apps/web/src/lib/forms/incoming-webhook-form-schema.ts` |
| 8 | `apps/web/src/lib/forms/mapping-config-form-schema.ts` |
| 9 | `apps/web/src/lib/forms/appearance-form-schema.ts` |
| 10 | `apps/web/src/lib/forms/authorized-address-form-schema.ts` |

---

### Cluster 34: Native App — Screens & Layout
**What:** Expo/React Native tab layout, tab screens (dashboard, clients, projects, tickets), detail views, modal, and not-found screen.
**Dependencies:** `@DCRM/api`, Expo Router, Uniwind
**Review Focus:** UI logic, data flow (tRPC queries), navigation, mobile UX patterns

| # | File |
|---|------|
| 1 | `apps/native/app/_layout.tsx` |
| 2 | `apps/native/app/(tabs)/_layout.tsx` |
| 3 | `apps/native/app/(tabs)/index.tsx` |
| 4 | `apps/native/app/(tabs)/clients.tsx` |
| 5 | `apps/native/app/(tabs)/projects.tsx` |
| 6 | `apps/native/app/(tabs)/tickets.tsx` |
| 7 | `apps/native/app/client/[id].tsx` |
| 8 | `apps/native/app/project/[id].tsx` |
| 9 | `apps/native/app/ticket/[id].tsx` |
| 10 | `apps/native/app/exchange/[id].tsx` |
| 11 | `apps/native/app/modal.tsx` |
| 12 | `apps/native/app/+not-found.tsx` |

---

### Cluster 35: Native App — Create Screens & Shared Modules
**What:** Create screens (client, project, ticket, exchange), shared components (status badge, container, auth forms, theme toggle), theme context, auth client, tRPC setup.
**Dependencies:** `@DCRM/api`, `@DCRM/auth`, Expo Router, Uniwind
**Review Focus:** UI logic, data flow (tRPC mutations), form handling, auth flow

| # | File |
|---|------|
| 1 | `apps/native/app/create-client.tsx` |
| 2 | `apps/native/app/create-project.tsx` |
| 3 | `apps/native/app/create-ticket.tsx` |
| 4 | `apps/native/app/create-exchange.tsx` |
| 5 | `apps/native/components/status-badge.tsx` |
| 6 | `apps/native/components/container.tsx` |
| 7 | `apps/native/components/sign-in.tsx` |
| 8 | `apps/native/components/sign-up.tsx` |
| 9 | `apps/native/components/theme-toggle.tsx` |
| 10 | `apps/native/contexts/app-theme-context.tsx` |
| 11 | `apps/native/lib/auth-client.ts` |
| 12 | `apps/native/utils/trpc.ts` |

---

### Cluster 36: Desktop Shell
**What:** Electrobun desktop application entry point — creates browser window, handles dev mode HMR detection.
**Dependencies:** Electrobun
**Review Focus:** Minimal — dev/prod mode detection, window configuration

| # | File |
|---|------|
| 1 | `apps/desktop/src/bun/index.ts` |

---

## 3. Summary Statistics

| Metric | Value |
|--------|-------|
| **Total reviewable files** | 344 |
| **Total clusters** | 36 |
| **Smallest cluster** | 1 file (Desktop Shell) |
| **Largest cluster** | 13 files (AI Chat & Provider, Client/Lead schema tests) |
| **Average cluster size** | ~9.6 files |
| **Packages with source code** | 14 (excl. config) |
| **App targets** | 3 (web, native, desktop) |

### Files by Area

| Area | Files | Clusters |
|------|-------|----------|
| Infrastructure (db, auth, crypto, env) | 31 | 3 |
| Domain types | 23 | 2 |
| Service packages (events, ai, email, webhooks, storage, billing, i18n) | 62 | 7 |
| API routers | 152 | 14 |
| Web app | 58 | 6 |
| Native app | 24 | 2 |
| Desktop app | 1 | 1 |
| API infrastructure | 4 | 1 |

---

## 4. Cluster Dependency Graph

```
Cluster 3 (Auth/Crypto/Env) ──┐
Cluster 2 (DB Schema) ────────┤
Cluster 4 (Domain-CRM) ───────┤
Cluster 5 (Domain-Infra) ─────┤
                               ├─→ Cluster 1 (API Infra)
                               │      │
                               │      ├─→ Clusters 14-27 (API Routers)
                               │      │      │
                               │      │      ├─→ Clusters 28-33 (Web App)
                               │      │      └─→ Clusters 34-35 (Native App)
                               │      │
Cluster 6 (Events) ───────────┤      │
Cluster 7-8 (AI) ─────────────┤      │
Cluster 9 (Email) ────────────┤      │
Cluster 10 (Webhooks) ────────┤      │
Cluster 11 (Storage) ─────────┤      │
Cluster 12 (Billing) ─────────┤      │
Cluster 13 (i18n) ────────────┘      │
                                      │
Cluster 36 (Desktop) ←──── Web build ┘
```

---

## 5. Recommended Review Priority

| Priority | Clusters | Rationale |
|----------|----------|-----------|
| **P0 — Critical** | 1, 3, 21, 19, 26 | API infra, auth/crypto/env, incoming webhook receiver (unauthenticated), email account (credentials), file uploads |
| **P1 — High** | 2, 6, 14, 15, 18, 9, 12 | DB schema, event engine, client/lead CRUD (core business), exchange (email sending), email processing, billing |
| **P2 — Medium** | 4, 5, 7, 8, 10, 16, 17, 22, 23, 27 | Domain types, AI engine, webhooks, project/ticket CRUD, AI chat/provider, import/export, hooks |
| **P3 — Standard** | 11, 13, 20, 24, 25, 28-36 | Storage, i18n, outgoing webhooks, tags, notifications, settings, all frontend UI |
