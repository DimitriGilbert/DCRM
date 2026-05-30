# DCRM2 Project Exploration Map

**Generated:** 2026-05-30
**Session:** session-20260530-083007

---

## 1. Project Structure Overview

```
DCRM2/                              # Monorepo root (pnpm workspaces + Turborepo)
├── apps/
│   ├── web/                        # TanStack Start (Vite + React 19 + Router + React Query)
│   ├── native/                     # Expo + Uniwind (mobile) — has real screen logic
│   └── desktop/                    # Electrobun wrapper — EXCLUDED (scaffolding only)
├── packages/
│   ├── api/                        # tRPC routers, procedures, context
│   ├── auth/                       # Better Auth config, session handling, API key auth
│   ├── db/                         # Drizzle schema, migrations, PostgreSQL
│   ├── ui/                         # shadcn/formedible — EXCLUDED (dep libraries)
│   ├── env/                        # Env validation (@t3-oss/env-core + Zod 4)
│   ├── config/                     # Shared TS configs — EXCLUDED (pure config)
│   ├── ai/                         # AI chat, adapters, structured output, tools
│   ├── billing/                    # Stripe integration, subscription middleware
│   ├── crypto/                     # AES-256-GCM encryption/decryption service
│   ├── domain/                     # Shared domain constants, Zod schemas, enums
│   ├── email/                      # SMTP sending, IMAP sync, threading, matching
│   ├── events/                     # Event emitter, hook executor, queue, retry, provenance
│   ├── i18n/                       # Internationalization engine, locale data
│   ├── storage/                    # File storage backends (local + S3)
│   └── webhooks/                   # Outgoing/incoming webhook execution, auth, payload mapping
└── Dockerfile, docker-compose.yml  # Deployment infrastructure
```

**Excluded from review:**
- `node_modules/`, `dist/`, `.turbo/`, `.vinxi/`, `.next/`, `build/`
- `apps/desktop/` — Electrobun scaffolding (35-line wrapper + config)
- `packages/ui/src/components/` — shadcn component library + Formedible form library (dependencies)
- `packages/config/` — Pure JSON/TSConfig, no logic
- `apps/web/src/routeTree.gen.ts` — Auto-generated TanStack Router route tree
- `packages/storage/src/aws-sdk.d.ts` — Third-party type declaration
- `apps/native/uniwind-env.d.ts` — Third-party type declaration
- `*.vitest.config.ts` — Test runner configuration, no business logic
- Lock files, package.json, tsconfig.json, etc.

---

## 2. Reviewable Files Grouped Into Clusters

---

### Cluster 1: Database Schema

**What it does:** Defines the PostgreSQL schema via Drizzle ORM. Three schema domains: auth (Better Auth tables), CRM (clients, leads, projects, tickets, exchanges, tags, attachments, notifications), and automation (hooks, webhook configs, AI providers, email accounts, incoming webhooks, custom fields, billing). Includes Drizzle migration config and a Docker Compose for local Postgres.

**Files (9):**
1. `packages/db/src/schema/auth.ts`
2. `packages/db/src/schema/crm.ts`
3. `packages/db/src/schema/automation.ts`
4. `packages/db/src/schema/index.ts`
5. `packages/db/src/index.ts`
6. `packages/db/drizzle.config.ts`
7. `packages/db/docker-compose.yml`
8. `packages/db/__tests__/crm-schema.test.ts`
9. `packages/db/__tests__/automation-schema.test.ts`

**Dependencies:** `drizzle-orm`, `@DCRM/domain` (for enum constants)

**Review focus:** Data modeling correctness, indexing strategy, foreign key constraints, cascade deletes, nullable/column type safety, migration compatibility.

---

### Cluster 2: Auth

**What it does:** Better Auth configuration, session resolution middleware for tRPC context, API key authentication with hashed key storage, type definitions for auth results.

**Files (5):**
1. `packages/auth/src/index.ts`
2. `packages/auth/src/resolve-auth.ts`
3. `packages/auth/src/api-key.ts`
4. `packages/auth/src/types.ts`
5. `packages/auth/__tests__/api-key.test.ts`

**Dependencies:** `better-auth`, `@DCRM/db` (for user/session tables), `@DCRM/crypto`

**Review focus:** Security — session validation, API key hashing, timing-safe comparisons, auth bypass risks, secret handling.

---

### Cluster 3: Infrastructure — Env Validation, Crypto, Docker

**What it does:** Environment variable validation for server/web/native environments using Zod schemas. AES-256-GCM encryption/decryption service for secrets (webhook auth tokens, API keys). Docker deployment configuration for the full stack.

**Files (9):**
1. `packages/env/src/server.ts`
2. `packages/env/src/web.ts`
3. `packages/env/src/native.ts`
4. `packages/env/__tests__/server.test.ts`
5. `packages/crypto/src/index.ts`
6. `packages/crypto/src/encrypt.ts`
7. `packages/crypto/__tests__/encrypt.test.ts`
8. `docker-compose.yml`
9. `Dockerfile`

**Dependencies:** `@t3-oss/env-core`, `zod`, `node:crypto`

**Review focus:** Security — encryption implementation (IV handling, key derivation), env variable exposure, Docker secrets, container security, CORS/origin config.

---

### Cluster 4: Domain Types — Core Entities

**What it does:** Shared domain constants, Zod schemas, and TypeScript types for the core CRM entities: leads (stages), projects (statuses), tickets (types/statuses/priorities), exchanges (types), events (sources), and hooks (types/write behaviors/execution statuses).

**Files (13):**
1. `packages/domain/src/index.ts`
2. `packages/domain/src/lead.ts`
3. `packages/domain/src/project.ts`
4. `packages/domain/src/ticket.ts`
5. `packages/domain/src/exchange.ts`
6. `packages/domain/src/event.ts`
7. `packages/domain/src/hook.ts`
8. `packages/domain/__tests__/lead.test.ts`
9. `packages/domain/__tests__/project.test.ts`
10. `packages/domain/__tests__/ticket.test.ts`
11. `packages/domain/__tests__/exchange.test.ts`
12. `packages/domain/__tests__/event.test.ts`
13. `packages/domain/__tests__/hook.test.ts`

**Dependencies:** `zod`

**Review focus:** Schema correctness, enum exhaustiveness, type narrowing, const assertion safety, business rule alignment with PRD.

---

### Cluster 5: Domain Types — Supporting Modules

**What it does:** Shared domain types for supporting modules: billing statuses, attachment entity types, webhook auth modes (outgoing + incoming), custom field types, and AI provider identifiers.

**Files (10):**
1. `packages/domain/src/billing.ts`
2. `packages/domain/src/attachment.ts`
3. `packages/domain/src/webhook.ts`
4. `packages/domain/src/custom-field.ts`
5. `packages/domain/src/ai.ts`
6. `packages/domain/__tests__/billing.test.ts`
7. `packages/domain/__tests__/attachment.test.ts`
8. `packages/domain/__tests__/webhook.test.ts`
9. `packages/domain/__tests__/custom-field.test.ts`
10. `packages/domain/__tests__/ai.test.ts`

**Dependencies:** `zod`

**Review focus:** Same as Cluster 4 — schema correctness, enum exhaustiveness, type safety.

---

### Cluster 6: Event Engine

**What it does:** Typed event emitter with provenance tracking, hook resolution and execution pipeline, event queue with retry logic. Every meaningful action in the CRM emits a typed event. Hooks can subscribe to events and trigger side effects (outgoing webhooks, AI actions).

**Files (11):**
1. `packages/events/src/index.ts`
2. `packages/events/src/emitter.ts`
3. `packages/events/src/executor.ts`
4. `packages/events/src/provenance.ts`
5. `packages/events/src/queue.ts`
6. `packages/events/src/hook-resolver.ts`
7. `packages/events/src/retry.ts`
8. `packages/events/src/event-types.ts`
9. `packages/events/__tests__/emitter.test.ts`
10. `packages/events/__tests__/hook-execution.test.ts`
11. `packages/events/__tests__/provenance.test.ts`

**Dependencies:** `@DCRM/domain`, `@DCRM/db`

**Review focus:** Reliability — retry logic correctness, queue ordering guarantees, event type exhaustiveness, provenance tracking accuracy, error handling in hook execution.

---

### Cluster 7: Webhooks Engine

**What it does:** Outgoing webhook HTTP execution with auth header resolution (Bearer, Basic, HMAC, custom headers), incoming webhook verification (signature validation, payload parsing), and payload field mapping/transformation.

**Files (7):**
1. `packages/webhooks/src/index.ts`
2. `packages/webhooks/src/outgoing.ts`
3. `packages/webhooks/src/auth.ts`
4. `packages/webhooks/src/incoming.ts`
5. `packages/webhooks/src/mapper.ts`
6. `packages/webhooks/__tests__/incoming.test.ts`
7. `packages/webhooks/__tests__/outgoing.test.ts`

**Dependencies:** `@DCRM/crypto`, `@DCRM/domain`

**Review focus:** Security — webhook signature verification, auth token encryption/decryption, HMAC calculation, HTTP client security (SSRF, redirects, timeouts), payload injection.

---

### Cluster 8: Email Engine

**What it does:** SMTP email sending, IMAP mailbox synchronization (importing emails as exchanges), email threading (grouping by conversation), client matching (linking emails to CRM clients), configuration for email accounts, and unmatched email handling.

**Files (11):**
1. `packages/email/src/index.ts`
2. `packages/email/src/smtp.ts`
3. `packages/email/src/imap-sync.ts`
4. `packages/email/src/threading.ts`
5. `packages/email/src/matching.ts`
6. `packages/email/src/config.ts`
7. `packages/email/src/unmatched.ts`
8. `packages/email/__tests__/smtp.test.ts`
9. `packages/email/__tests__/imap-sync.test.ts`
10. `packages/email/__tests__/threading.test.ts`
11. `packages/email/__tests__/matching.test.ts`

**Dependencies:** `nodemailer`, `imapflow`, `@DCRM/db`, `@DCRM/domain`

**Review focus:** Security — SMTP credential handling, IMAP auth, email header injection, data flow — threading logic correctness, matching accuracy, sync reliability, error handling for network failures.

---

### Cluster 9: Storage

**What it does:** Abstract storage backend interface with two implementations: local filesystem and S3-compatible (AWS). Handles file uploads/downloads for attachments. Enforces per-user path partitioning and quota limits.

**Files (6):**
1. `packages/storage/src/types.ts`
2. `packages/storage/src/storage.ts`
3. `packages/storage/src/local.ts`
4. `packages/storage/src/s3.ts`
5. `packages/storage/src/index.ts`
6. `packages/storage/__tests__/storage.test.ts`

**Dependencies:** `@aws-sdk/client-s3`, `@DCRM/env`

**Review focus:** Security — path traversal prevention, S3 bucket security, user isolation enforcement, quota bypass risks, error handling for storage failures.

---

### Cluster 10: AI Engine Core

**What it does:** AI chat orchestration, structured output generation, provider management (multi-provider support), hook executor for AI-driven automation, field mapping for AI responses, tool definitions, and prompt templates.

**Files (13):**
1. `packages/ai/src/index.ts`
2. `packages/ai/src/types.ts`
3. `packages/ai/src/chat.ts`
4. `packages/ai/src/hook-executor.ts`
5. `packages/ai/src/field-mapper.ts`
6. `packages/ai/src/provider-manager.ts`
7. `packages/ai/src/structured-output.ts`
8. `packages/ai/src/tools/index.ts`
9. `packages/ai/src/templates/index.ts`
10. `packages/ai/__tests__/chat.test.ts`
11. `packages/ai/__tests__/hook-executor.test.ts`
12. `packages/ai/__tests__/provider.test.ts`
13. `packages/ai/__tests__/structured-output.test.ts`

**Dependencies:** `@DCRM/domain`, `@DCRM/db`, `@DCRM/events`

**Review focus:** Data flow — prompt construction, response parsing, structured output validation, provider failover logic, error handling for AI API failures, security — API key handling, prompt injection prevention.

---

### Cluster 11: AI Engine Adapters

**What it does:** LLM provider adapters implementing a common interface for OpenAI, Anthropic, Google, and OpenRouter APIs. Each adapter handles provider-specific request formatting and response parsing.

**Files (4):**
1. `packages/ai/src/adapters/openai.ts`
2. `packages/ai/src/adapters/anthropic.ts`
3. `packages/ai/src/adapters/google.ts`
4. `packages/ai/src/adapters/openrouter.ts`

**Dependencies:** `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `packages/ai/src/types.ts`

**Review focus:** Security — API key handling in requests, response validation, error handling for provider-specific error formats, rate limiting.

---

### Cluster 12: Billing

**What it does:** Stripe integration for subscription management, billing status middleware (feature gating based on subscription tier), and subscription lifecycle handling.

**Files (5):**
1. `packages/billing/src/index.ts`
2. `packages/billing/src/stripe.ts`
3. `packages/billing/src/subscription.ts`
4. `packages/billing/src/middleware.ts`
5. `packages/billing/__tests__/billing.test.ts`

**Dependencies:** `stripe`, `@DCRM/domain`, `@DCRM/db`

**Review focus:** Security — Stripe webhook signature verification, billing bypass risks, subscription state machine correctness, race conditions in status transitions.

---

### Cluster 13: i18n

**What it does:** Lightweight internationalization engine with locale detection, translation lookup with interpolation, and runtime locale registration. Includes English locale data.

**Files (5):**
1. `packages/i18n/src/types.ts`
2. `packages/i18n/src/i18n.ts`
3. `packages/i18n/src/index.ts`
4. `packages/i18n/src/locales/en.ts`
5. `packages/i18n/src/__tests__/i18n.test.ts`

**Dependencies:** None (standalone)

**Review focus:** Logic — locale fallback behavior, interpolation safety (XSS), key collision handling.

---

### Cluster 14: API Core

**What it does:** tRPC initialization, context creation (auth resolution from request headers), and the master router that composes all sub-routers into the appRouter. Defines publicProcedure and protectedProcedure.

**Files (3):**
1. `packages/api/src/index.ts`
2. `packages/api/src/context.ts`
3. `packages/api/src/routers/index.ts`

**Dependencies:** `@trpc/server`, `@DCRM/auth`

**Review focus:** Security — context creation correctness, auth bypass in protectedProcedure, router composition completeness, type safety of AppRouter export.

---

### Cluster 15: API — Client Router

**What it does:** Full CRUD for CRM clients plus search, soft-delete with restore, and infrastructure queries. All operations scoped by userId.

**Files (12):**
1. `packages/api/src/routers/client/index.ts`
2. `packages/api/src/routers/client/schemas.ts`
3. `packages/api/src/routers/client/create.ts`
4. `packages/api/src/routers/client/read.ts`
5. `packages/api/src/routers/client/update.ts`
6. `packages/api/src/routers/client/soft-delete.ts`
7. `packages/api/src/routers/client/restore.ts`
8. `packages/api/src/routers/client/list.ts`
9. `packages/api/src/routers/client/search.ts`
10. `packages/api/src/routers/client/procedures.test.ts`
11. `packages/api/src/routers/client/schemas.test.ts`
12. `packages/api/src/routers/client/infrastructure.test.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/events`

**Review focus:** Security — userId scoping on all queries/mutations, input validation (Zod schemas), data flow — soft-delete/restore logic, search correctness.

---

### Cluster 16: API — Lead Router

**What it does:** Full CRUD for leads plus stage updates, lead-to-client conversion, search, soft-delete with restore. Conversion is a key business operation that transforms a lead into a client.

**Files (13):**
1. `packages/api/src/routers/lead/index.ts`
2. `packages/api/src/routers/lead/schemas.ts`
3. `packages/api/src/routers/lead/create.ts`
4. `packages/api/src/routers/lead/read.ts`
5. `packages/api/src/routers/lead/update.ts`
6. `packages/api/src/routers/lead/update-stage.ts`
7. `packages/api/src/routers/lead/convert.ts`
8. `packages/api/src/routers/lead/soft-delete.ts`
9. `packages/api/src/routers/lead/restore.ts`
10. `packages/api/src/routers/lead/list.ts`
11. `packages/api/src/routers/lead/search.ts`
12. `packages/api/src/routers/lead/procedures.test.ts`
13. `packages/api/src/routers/lead/schemas.test.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/events`

**Review focus:** Logic — lead conversion transaction safety (atomicity), stage transition validation, userId scoping, input validation.

---

### Cluster 17: API — Project Router

**What it does:** Full CRUD for projects plus search, soft-delete with restore, and upcoming deadlines query.

**Files (12):**
1. `packages/api/src/routers/project/index.ts`
2. `packages/api/src/routers/project/schemas.ts`
3. `packages/api/src/routers/project/create.ts`
4. `packages/api/src/routers/project/read.ts`
5. `packages/api/src/routers/project/update.ts`
6. `packages/api/src/routers/project/soft-delete.ts`
7. `packages/api/src/routers/project/restore.ts`
8. `packages/api/src/routers/project/list.ts`
9. `packages/api/src/routers/project/search.ts`
10. `packages/api/src/routers/project/upcoming-deadlines.ts`
11. `packages/api/src/routers/project/procedures.test.ts`
12. `packages/api/src/routers/project/schemas.test.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/events`

**Review focus:** Data flow — deadline calculation logic, userId scoping, soft-delete cascade behavior, input validation.

---

### Cluster 18: API — Ticket Router

**What it does:** Full CRUD for tickets (scoped within projects) plus search, soft-delete with restore, and upcoming deadlines query.

**Files (12):**
1. `packages/api/src/routers/ticket/index.ts`
2. `packages/api/src/routers/ticket/schemas.ts`
3. `packages/api/src/routers/ticket/create.ts`
4. `packages/api/src/routers/ticket/read.ts`
5. `packages/api/src/routers/ticket/update.ts`
6. `packages/api/src/routers/ticket/soft-delete.ts`
7. `packages/api/src/routers/ticket/restore.ts`
8. `packages/api/src/routers/ticket/list.ts`
9. `packages/api/src/routers/ticket/search.ts`
10. `packages/api/src/routers/ticket/upcoming-deadlines.ts`
11. `packages/api/src/routers/ticket/procedures.test.ts`
12. `packages/api/src/routers/ticket/schemas.test.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/events`

**Review focus:** Data flow — ticket-project relationship enforcement, userId scoping, deadline queries, input validation.

---

### Cluster 19: API — Exchange Router

**What it does:** CRUD for exchanges (communication records: emails, calls, notes), email sending through exchanges, and exchange timeline retrieval.

**Files (9):**
1. `packages/api/src/routers/exchange/index.ts`
2. `packages/api/src/routers/exchange/schemas.ts`
3. `packages/api/src/routers/exchange/create.ts`
4. `packages/api/src/routers/exchange/read.ts`
5. `packages/api/src/routers/exchange/list.ts`
6. `packages/api/src/routers/exchange/send-email.ts`
7. `packages/api/src/routers/exchange/timeline.ts`
8. `packages/api/src/routers/exchange/procedures.test.ts`
9. `packages/api/src/routers/exchange/schemas.test.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/events`, `@DCRM/email`

**Review focus:** Security — email sending authorization, userId scoping, data flow — timeline ordering, email linking to clients.

---

### Cluster 20: API — Attachments

**What it does:** File upload, download, delete, read, and list for entity-scoped attachments. Integrates with the storage package.

**Files (7):**
1. `packages/api/src/routers/attachment/index.ts`
2. `packages/api/src/routers/attachment/schemas.ts`
3. `packages/api/src/routers/attachment/upload.ts`
4. `packages/api/src/routers/attachment/download.ts`
5. `packages/api/src/routers/attachment/delete.ts`
6. `packages/api/src/routers/attachment/read.ts`
7. `packages/api/src/routers/attachment/list.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/storage`, `@DCRM/events`

**Review focus:** Security — file upload validation (MIME type, size limits), path traversal prevention, user-scoped access control on downloads, unauthorized file access.

---

### Cluster 21: API — Tags & Entity Tags

**What it does:** Tag CRUD (create, update, delete, list) and entity-tag association management (attach/detach tags to/from clients, leads, projects, tickets).

**Files (12):**
1. `packages/api/src/routers/tag/index.ts`
2. `packages/api/src/routers/tag/schemas.ts`
3. `packages/api/src/routers/tag/create.ts`
4. `packages/api/src/routers/tag/update.ts`
5. `packages/api/src/routers/tag/delete.ts`
6. `packages/api/src/routers/tag/list.ts`
7. `packages/api/src/routers/entity-tag/index.ts`
8. `packages/api/src/routers/entity-tag/schemas.ts`
9. `packages/api/src/routers/entity-tag/attach.ts`
10. `packages/api/src/routers/entity-tag/detach.ts`
11. `packages/api/src/routers/tag/schemas.test.ts`
12. `packages/api/src/routers/entity-tag/schemas.test.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/events`

**Review focus:** Data flow — entity-type polymorphism in tag associations, userId scoping, cascade behavior on tag deletion, duplicate attachment prevention.

---

### Cluster 22: API — Search, Import & Export

**What it does:** Global cross-entity search, CSV client import (parsing + bulk creation), and data export (CSV generation, full data export). Handles file parsing and serialization.

**Files (15):**
1. `packages/api/src/routers/search/index.ts`
2. `packages/api/src/routers/search/schemas.ts`
3. `packages/api/src/routers/search/global.ts`
4. `packages/api/src/routers/import/index.ts`
5. `packages/api/src/routers/import/schemas.ts`
6. `packages/api/src/routers/import/parse-csv.ts`
7. `packages/api/src/routers/import/import-clients.ts`
8. `packages/api/src/routers/export/index.ts`
9. `packages/api/src/routers/export/schemas.ts`
10. `packages/api/src/routers/export/csv-utils.ts`
11. `packages/api/src/routers/export/export-list.ts`
12. `packages/api/src/routers/export/full-data-export.ts`
13. `packages/api/src/routers/search/schemas.test.ts`
14. `packages/api/src/routers/import/procedures.test.ts`
15. `packages/api/src/routers/export/csv-utils.test.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/events`, `@DCRM/storage`

**Review focus:** Security — CSV injection prevention, file upload size limits, data leakage in export (ensuring userId scoping), logic — CSV parsing edge cases, search relevance, bulk import transaction safety.

---

### Cluster 23: API — Notifications, Settings & Billing

**What it does:** Notification management (list, mark read, mark all read), user settings (theme, locale, onboarding completion), and billing status queries. A catch-all cluster for smaller, related user-facing API surfaces.

**Files (12):**
1. `packages/api/src/routers/notification/index.ts`
2. `packages/api/src/routers/notification/schemas.ts`
3. `packages/api/src/routers/notification/list.ts`
4. `packages/api/src/routers/notification/mark-read.ts`
5. `packages/api/src/routers/notification/mark-all-read.ts`
6. `packages/api/src/routers/settings/index.ts`
7. `packages/api/src/routers/settings/schemas.ts`
8. `packages/api/src/routers/settings/get-settings.ts`
9. `packages/api/src/routers/settings/update-theme.ts`
10. `packages/api/src/routers/settings/update-locale.ts`
11. `packages/api/src/routers/settings/complete-onboarding.ts`
12. `packages/api/src/routers/billing/index.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/billing`

**Review focus:** Logic — settings validation, notification scoping, billing integration correctness, onboarding state machine.

---

### Cluster 24: API — Email Accounts

**What it does:** CRUD for email account configurations (SMTP/IMAP credentials), plus authorized address management (add/remove/list). Email accounts are linked to the user for sending/receiving emails as exchanges.

**Files (10):**
1. `packages/api/src/routers/email-account/index.ts`
2. `packages/api/src/routers/email-account/schemas.ts`
3. `packages/api/src/routers/email-account/create.ts`
4. `packages/api/src/routers/email-account/read.ts`
5. `packages/api/src/routers/email-account/update.ts`
6. `packages/api/src/routers/email-account/delete.ts`
7. `packages/api/src/routers/email-account/list.ts`
8. `packages/api/src/routers/email-account/add-authorized-address.ts`
9. `packages/api/src/routers/email-account/remove-authorized-address.ts`
10. `packages/api/src/routers/email-account/list-authorized-addresses.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/crypto`, `@DCRM/events`

**Review focus:** Security — SMTP/IMAP credential encryption at rest, authorized address validation, userId scoping, credential rotation.

---

### Cluster 25: API — AI Chat & Providers

**What it does:** AI chat message sending/receiving/history, and AI provider configuration management (CRUD for provider API keys and settings). Integrates with the AI engine package.

**Files (13):**
1. `packages/api/src/routers/ai-chat/index.ts`
2. `packages/api/src/routers/ai-chat/schemas.ts`
3. `packages/api/src/routers/ai-chat/send-message.ts`
4. `packages/api/src/routers/ai-chat/list-messages.ts`
5. `packages/api/src/routers/ai-chat/clear-history.ts`
6. `packages/api/src/routers/ai-chat/data-access.ts`
7. `packages/api/src/routers/ai-provider/index.ts`
8. `packages/api/src/routers/ai-provider/schemas.ts`
9. `packages/api/src/routers/ai-provider/create.ts`
10. `packages/api/src/routers/ai-provider/read.ts`
11. `packages/api/src/routers/ai-provider/update.ts`
12. `packages/api/src/routers/ai-provider/delete.ts`
13. `packages/api/src/routers/ai-provider/list.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/ai`, `@DCRM/crypto`, `@DCRM/events`

**Review focus:** Security — AI provider API key encryption/storage, prompt injection risks, userId scoping on chat history, data flow — message persistence, streaming behavior.

---

### Cluster 26: API — Hooks

**What it does:** CRUD for automation hooks (event-driven triggers), plus insight management (AI-generated hook suggestions) and execution history. Hooks are the core automation primitive that connects events to actions.

**Files (10):**
1. `packages/api/src/routers/hook/index.ts`
2. `packages/api/src/routers/hook/schemas.ts`
3. `packages/api/src/routers/hook/create.ts`
4. `packages/api/src/routers/hook/read.ts`
5. `packages/api/src/routers/hook/update.ts`
6. `packages/api/src/routers/hook/delete.ts`
7. `packages/api/src/routers/hook/list.ts`
8. `packages/api/src/routers/hook/accept-insight.ts`
9. `packages/api/src/routers/hook/list-insights.ts`
10. `packages/api/src/routers/hook/list-executions.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/events`, `@DCRM/ai`

**Review focus:** Logic — hook configuration validation (event types, action types), insight acceptance workflow, execution history pagination, userId scoping.

---

### Cluster 27: API — Webhooks (Outgoing)

**What it does:** CRUD for outgoing webhook configurations plus auth builder utility. Outgoing webhooks are HTTP calls triggered by events, with configurable authentication (Bearer, Basic, HMAC, custom headers).

**Files (8):**
1. `packages/api/src/routers/webhook/index.ts`
2. `packages/api/src/routers/webhook/schemas.ts`
3. `packages/api/src/routers/webhook/create.ts`
4. `packages/api/src/routers/webhook/read.ts`
5. `packages/api/src/routers/webhook/update.ts`
6. `packages/api/src/routers/webhook/delete.ts`
7. `packages/api/src/routers/webhook/list.ts`
8. `packages/api/src/routers/webhook/auth-builder.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/webhooks`, `@DCRM/crypto`

**Review focus:** Security — webhook URL validation (SSRF prevention), auth credential encryption, userId scoping, data flow — auth config construction.

---

### Cluster 28: API — Webhooks (Incoming)

**What it does:** CRUD for incoming webhook endpoints plus the webhook receiver (public-facing endpoint that accepts external POST requests) and mapping test utility. Incoming webhooks allow external services to push data into the CRM.

**Files (9):**
1. `packages/api/src/routers/incoming-webhook/index.ts`
2. `packages/api/src/routers/incoming-webhook/schemas.ts`
3. `packages/api/src/routers/incoming-webhook/create.ts`
4. `packages/api/src/routers/incoming-webhook/read.ts`
5. `packages/api/src/routers/incoming-webhook/update.ts`
6. `packages/api/src/routers/incoming-webhook/delete.ts`
7. `packages/api/src/routers/incoming-webhook/list.ts`
8. `packages/api/src/routers/incoming-webhook/receiver.ts`
9. `packages/api/src/routers/incoming-webhook/test-mapping.ts`

**Dependencies:** `@DCRM/db`, `@DCRM/domain`, `@DCRM/webhooks`, `@DCRM/crypto`

**Review focus:** Security — incoming webhook authentication/verification, signature validation, payload injection prevention, rate limiting concerns, receiver token handling, data flow — payload mapping correctness.

---

### Cluster 29: Web App Core — Router, Auth, Middleware, API Routes

**What it does:** TanStack Start application bootstrap: router configuration, root layout, authentication middleware, tRPC client setup, Better Auth client, server functions (get-user), API route handlers (auth proxy, tRPC proxy, webhook receiver), and Vite build config.

**Files (13):**
1. `apps/web/src/router.tsx`
2. `apps/web/src/routes/__root.tsx`
3. `apps/web/src/routes/index.tsx`
4. `apps/web/src/routes/login.tsx`
5. `apps/web/src/routes/_authenticated.tsx`
6. `apps/web/src/lib/auth-client.ts`
7. `apps/web/src/utils/trpc.ts`
8. `apps/web/src/middleware/auth.ts`
9. `apps/web/src/functions/get-user.ts`
10. `apps/web/src/routes/api/auth/$.ts`
11. `apps/web/src/routes/api/trpc/$.ts`
12. `apps/web/src/routes/api/webhook/$token.ts`
13. `apps/web/vite.config.ts`

**Dependencies:** `@tanstack/react-router`, `@tanstack/react-start`, `@trpc/client`, `@DCRM/auth`, `@DCRM/api`

**Review focus:** Security — auth middleware correctness, session handling on server functions, API route proxy safety, CORS, webhook token exposure, data flow — tRPC client configuration.

---

### Cluster 30: Web App — Shared Components

**What it does:** Shared UI components used across the web app: header with navigation, user menu with auth actions, sign-in/sign-up forms (Better Auth), notification bell, global search, exchange timeline display, and loading state.

**Files (8):**
1. `apps/web/src/components/header.tsx`
2. `apps/web/src/components/user-menu.tsx`
3. `apps/web/src/components/loader.tsx`
4. `apps/web/src/components/sign-in-form.tsx`
5. `apps/web/src/components/sign-up-form.tsx`
6. `apps/web/src/components/notification-bell.tsx`
7. `apps/web/src/components/global-search.tsx`
8. `apps/web/src/components/exchange-timeline.tsx`

**Dependencies:** `@DCRM/ui`, `@DCRM/auth`, `@DCRM/api`

**Review focus:** Data flow — tRPC query hooks usage, error handling, auth state management, XSS prevention in user-generated content display.

---

### Cluster 31: Web App — Form Schemas

**What it does:** Zod validation schemas for all application forms. Each form has a dedicated schema module defining input validation rules, transformation pipelines, and error messages.

**Files (10):**
1. `apps/web/src/lib/forms/client-form-schema.ts`
2. `apps/web/src/lib/forms/lead-form-schema.ts`
3. `apps/web/src/lib/forms/project-form-schema.ts`
4. `apps/web/src/lib/forms/ticket-form-schema.ts`
5. `apps/web/src/lib/forms/appearance-form-schema.ts`
6. `apps/web/src/lib/forms/ai-provider-form-schema.ts`
7. `apps/web/src/lib/forms/email-account-form-schema.ts`
8. `apps/web/src/lib/forms/authorized-address-form-schema.ts`
9. `apps/web/src/lib/forms/incoming-webhook-form-schema.ts`
10. `apps/web/src/lib/forms/mapping-config-form-schema.ts`

**Dependencies:** `zod`

**Review focus:** Logic — validation completeness (missing fields, edge cases), type safety (Zod 4 syntax), schema alignment with API schemas, transformation correctness.

---

### Cluster 32: Web App Routes — Clients & Leads

**What it does:** Route pages for the CRM client and lead entities: list views with search/filter, creation forms, detail views, and edit forms. Lead conversion page (convert lead to client).

**Files (9):**
1. `apps/web/src/routes/_authenticated/clients/index.tsx`
2. `apps/web/src/routes/_authenticated/clients/create.tsx`
3. `apps/web/src/routes/_authenticated/clients/$clientId.tsx`
4. `apps/web/src/routes/_authenticated/clients/$clientId.edit.tsx`
5. `apps/web/src/routes/_authenticated/leads/index.tsx`
6. `apps/web/src/routes/_authenticated/leads/create.tsx`
7. `apps/web/src/routes/_authenticated/leads/$leadId.tsx`
8. `apps/web/src/routes/_authenticated/leads/$leadId.edit.tsx`
9. `apps/web/src/routes/_authenticated/leads/$leadId.convert.tsx`

**Dependencies:** `@DCRM/api`, `@DCRM/ui`, Formedible form schemas

**Review focus:** Data flow — tRPC mutation/query integration, optimistic updates, error handling, loading states, form submission flow.

---

### Cluster 33: Web App Routes — Projects & Tickets

**What it does:** Route pages for projects and tickets: list views, creation forms, detail views, edit forms. Tickets are nested under projects in the route hierarchy. Also includes the top-level tickets index.

**Files (9):**
1. `apps/web/src/routes/_authenticated/projects/index.tsx`
2. `apps/web/src/routes/_authenticated/projects/create.tsx`
3. `apps/web/src/routes/_authenticated/projects/$projectId.tsx`
4. `apps/web/src/routes/_authenticated/projects/$projectId.edit.tsx`
5. `apps/web/src/routes/_authenticated/projects/$projectId/tickets/index.tsx`
6. `apps/web/src/routes/_authenticated/projects/$projectId/tickets/create.tsx`
7. `apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.tsx`
8. `apps/web/src/routes/_authenticated/projects/$projectId/tickets/$ticketId.edit.tsx`
9. `apps/web/src/routes/_authenticated/tickets/index.tsx`

**Dependencies:** `@DCRM/api`, `@DCRM/ui`, Formedible form schemas

**Review focus:** Data flow — parent-child route parameter passing, tRPC integration, nested resource loading, form submission flow.

---

### Cluster 34: Web App Routes — Settings, Onboarding, Dashboard, AI Chat

**What it does:** Dashboard overview page, AI chat interface, settings pages (appearance, AI providers, email accounts, incoming webhooks), and onboarding flow (initial email and AI setup). These are the non-CRM-entity routes.

**Files (10):**
1. `apps/web/src/routes/_authenticated/dashboard.tsx`
2. `apps/web/src/routes/_authenticated/ai-chat.tsx`
3. `apps/web/src/routes/_authenticated/settings.tsx`
4. `apps/web/src/routes/_authenticated/settings/appearance.tsx`
5. `apps/web/src/routes/_authenticated/settings/ai-providers.tsx`
6. `apps/web/src/routes/_authenticated/settings/email.tsx`
7. `apps/web/src/routes/_authenticated/settings/incoming-webhooks.tsx`
8. `apps/web/src/routes/_authenticated/onboarding/index.tsx`
9. `apps/web/src/routes/_authenticated/onboarding/email-setup.tsx`
10. `apps/web/src/routes/_authenticated/onboarding/ai-setup.tsx`

**Dependencies:** `@DCRM/api`, `@DCRM/ui`, Formedible form schemas, `@DCRM/ai`

**Review focus:** Data flow — dashboard data aggregation, AI chat streaming behavior, settings persistence, onboarding state machine, sensitive data handling in provider forms.

---

### Cluster 35: Native App — Core, Navigation & Tab Screens

**What it does:** Expo/React Native app core setup: root layout with providers (QueryClient, theme, gesture handler), tab navigation layout, tab screen list views (dashboard, clients, projects, tickets), tRPC client configuration with auth cookie forwarding, Better Auth Expo client, theme context, and utility components.

**Files (12):**
1. `apps/native/utils/trpc.ts`
2. `apps/native/lib/auth-client.ts`
3. `apps/native/contexts/app-theme-context.tsx`
4. `apps/native/app/_layout.tsx`
5. `apps/native/app/(tabs)/_layout.tsx`
6. `apps/native/app/(tabs)/index.tsx`
7. `apps/native/app/(tabs)/clients.tsx`
8. `apps/native/app/(tabs)/projects.tsx`
9. `apps/native/app/(tabs)/tickets.tsx`
10. `apps/native/app/modal.tsx`
11. `apps/native/app/+not-found.tsx`
12. `apps/native/components/container.tsx`

**Dependencies:** `@tanstack/react-query`, `@trpc/client`, `better-auth/react`, `expo-router`, `@DCRM/api`, `@DCRM/env`

**Review focus:** Security — auth cookie handling on native vs web, secure storage usage, data flow — tRPC client configuration, navigation structure.

---

### Cluster 36: Native App — Detail Screens, Create Screens & Components

**What it does:** Expo detail screens for clients, projects, tickets, and exchanges. Modal screens for creating new entities. Shared components: status badge, sign-in/sign-up forms, theme toggle.

**Files (12):**
1. `apps/native/app/client/[id].tsx`
2. `apps/native/app/project/[id].tsx`
3. `apps/native/app/ticket/[id].tsx`
4. `apps/native/app/exchange/[id].tsx`
5. `apps/native/app/create-client.tsx`
6. `apps/native/app/create-project.tsx`
7. `apps/native/app/create-ticket.tsx`
8. `apps/native/app/create-exchange.tsx`
9. `apps/native/components/status-badge.tsx`
10. `apps/native/components/sign-in.tsx`
11. `apps/native/components/sign-up.tsx`
12. `apps/native/components/theme-toggle.tsx`

**Dependencies:** `@DCRM/api`, `expo-router`

**Review focus:** Data flow — screen parameter handling, tRPC query integration, form submission, auth flow in native context.

---

## 3. Summary Statistics

| Metric | Value |
|--------|-------|
| Total clusters | **36** |
| Total reviewable source files | **~318** |
| Largest cluster | Cluster 22 (Search/Import/Export) — 15 files |
| Smallest cluster | Cluster 14 (API Core) — 3 files |

### Files Per Package

| Package / App | Source Files | Test Files | Total |
|---------------|-------------|------------|-------|
| `packages/db` | 6 | 2 | 8 |
| `packages/auth` | 4 | 1 | 5 |
| `packages/env` | 3 | 1 | 4 |
| `packages/crypto` | 2 | 1 | 3 |
| `packages/domain` | 12 | 11 | 23 |
| `packages/events` | 8 | 3 | 11 |
| `packages/webhooks` | 5 | 2 | 7 |
| `packages/email` | 7 | 4 | 11 |
| `packages/storage` | 5 | 1 | 6 |
| `packages/ai` | 13 | 4 | 17 |
| `packages/billing` | 4 | 1 | 5 |
| `packages/i18n` | 4 | 1 | 5 |
| `packages/api` | 97 | 13 | 110 |
| `apps/web` | 51 | 0 | 51 |
| `apps/native` | 24 | 0 | 24 |
| Docker files | 2 | 0 | 2 |
| **Totals** | **~247** | **~45** | **~292** |

*Note: File counts are approximate; some test files are in `__tests__/` directories and some are colocated with source (e.g. `*.test.ts`).*

---

## 4. Recommended Review Focus by Priority

### CRITICAL — Security Review (Clusters 2, 3, 7, 20, 24, 25, 28, 29)
- Auth session validation and API key handling
- Encryption implementation (IV, key management)
- Webhook signature verification and auth token encryption
- File upload security (path traversal, MIME validation)
- Email/IMAP credential storage
- AI provider API key storage
- Incoming webhook receiver (public endpoint)
- Docker container security

### HIGH — Business Logic Review (Clusters 6, 8, 10, 12, 15, 16, 17, 18, 22)
- Event engine retry and queue reliability
- Email threading and matching correctness
- AI chat orchestration and prompt construction
- Billing subscription state machine
- Lead conversion transaction safety
- CSV import/export edge cases
- Soft-delete/restore behavior

### MEDIUM — Data Flow & Integration (Clusters 1, 4, 5, 11, 13, 14, 19, 21, 23, 26, 27, 30, 31)
- Database schema design and indexing
- Domain type exhaustiveness
- tRPC router composition and context
- API procedure userId scoping
- Form validation alignment with API schemas
- Component data fetching patterns

### STANDARD — UI/UX & Cross-Platform (Clusters 32, 33, 34, 35, 36)
- Route page implementations
- Form submission flows
- Native app auth cookie handling
- Navigation structure
