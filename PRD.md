# DCRM — Product Requirements Document

> **Micro CRM for Independent Contractors & Freelancers**
> Open-source, self-hostable, AI-powered. Hosted version at €24/year.

---

## Problem Statement

Independent contractors, freelancers, and solo consultants juggle clients, projects, communications, and prospecting without a lightweight, affordable tool. Existing CRMs are either enterprise-focused (too complex, too expensive) or too simplistic (glorified contact lists). There is no open-source CRM that natively integrates AI assistance, email communication tracking, and an extensible event/hook system — all targeted at a single user, not a team.

## Solution

DCRM is a micro CRM designed for solo professionals who need to manage their entire client lifecycle — from lead prospecting to active project delivery — in one place. It provides:

- **Client management** with rich contact info, social links, addresses, and custom fields
- **Lead pipeline** to track prospects from first contact to conversion
- **Project & ticket tracking** with generic issues, budget, and hours
- **Email integration** via IMAP/SMTP with smart client matching
- **AI-powered hooks** (BYOK) that react to lifecycle events and enrich data
- **Extensible event/webhook system** for both outgoing and incoming integrations
- **Multi-platform**: web (TanStack Start), desktop (Electrobun), mobile (Expo)

All built on a modern, type-safe stack: TanStack Start + tRPC + Drizzle + PostgreSQL + Better Auth + shadcn.

## Tech Stack (Already Bootstrapped)

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web app | TanStack Start (SSR) + Vite |
| API | tRPC v11 |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Better Auth (email/password) |
| UI | shadcn/ui (base-lyra) + TailwindCSS v4 |
| Forms | Formedible (schema-driven shadnc component) |
| Desktop | Electrobun (web wrapper) |
| Mobile | Expo + Uniwind |
| AI | **TanStack AI** (NOT Vercel AI SDK — this is non-negotiable) |
| Deployment | Dokploy + docker-compose |

## User Stories

### Authentication & Onboarding

1. As a user, I want to sign up with email and password, so that I can create my account
2. As a user, I want to log in and out securely, so that my data is protected
3. As a user, I want to be guided through initial setup (AI keys, email config) on first login, so that I can hit the ground running
4. As a self-hoster, I want to deploy with a single `docker-compose up` and a `.env` file, so that setup takes 5 minutes

### Dashboard

5. As a user, I want to see a rich dashboard after login with overview stats, so that I immediately know the state of my business
6. As a user, I want to see recent activity on my dashboard, so that I can pick up where I left off
7. As a user, I want to see upcoming tasks/deadlines on my dashboard, so that I don't miss anything
8. As a user, I want to see my lead pipeline summary on the dashboard, so that I know how my prospecting is going
9. As a user, I want quick-action buttons on the dashboard (add client, add lead, add project), so that I can work efficiently

### Client Management

10. As a user, I want to create clients with name, email, phone, company name, website, notes, so that I have a complete contact record
11. As a user, I want to add social media links (LinkedIn, Twitter/X, etc.) to clients, so that I can reach them on their preferred channels
12. As a user, I want to add postal addresses to clients, so that I have info needed for invoicing and shipping
13. As a user, I want to define custom fields on clients (text, number, date, select, checkbox), so that I can track info specific to my business
14. As a user, I want to see all projects, tickets, and exchanges related to a client on their detail page, so that I have full context
15. As a user, I want to tag clients with flat tags, so that I can categorize and filter them
16. As a user, I want to soft-delete clients and restore them from trash, so that I don't accidentally lose data
17. As a user, I want to search across all clients by name, email, company, so that I can find contacts quickly
18. As a user, I want to see AI-enriched data on client profiles, so that I have insights without manual research

### Lead Pipeline

19. As a user, I want to create leads with the same fields as clients plus pipeline stage, estimated value, and source, so that I can track prospects before they become clients
20. As a user, I want to move leads through pipeline stages (New, Contacted, Qualified, Proposal, Won, Lost), so that I can visualize my sales funnel
21. As a user, I want to convert a won lead into a client with one click, so that I don't have to re-enter data
22. As a user, I want to see my lead pipeline as a visual board, so that I can drag-and-drop leads between stages
23. As a user, I want to see pipeline statistics (conversion rate, average deal value), so that I can improve my prospecting

### Project Management

24. As a user, I want to create projects tied to a specific client, so that work is organized per client
25. As a user, I want to set a budget (amount + currency) and estimated hours on projects, so that I can track financials
26. As a user, I want to log actual hours against a project, so that I can compare estimate vs reality
27. As a user, I want to see project status (planning, active, on-hold, completed, archived), so that I know where things stand
28. As a user, I want to define custom fields on projects, so that I can track project-specific metadata
29. As a user, I want to tag projects, so that I can categorize and filter them
30. As a user, I want to see all tickets and exchanges related to a project, so that I have full context
31. As a user, I want to attach files to projects, so that contracts, specs, and deliverables are stored centrally

### Ticket / Issue Management

32. As a user, I want to create generic issues (task, bug, feature, question) within a project, so that I can track all work items
33. As a user, I want to set ticket statuses (New, In Progress, Waiting, Resolved, Closed) with custom labels, so that the workflow matches my process
34. As a user, I want to set priority on tickets (low, medium, high, critical), so that I can triage effectively
35. As a user, I want to assign due dates to tickets, so that I can track deadlines
36. As a user, I want to see tickets in a list or kanban view, so that I can work the way I prefer
37. As a user, I want to add comments/notes to tickets, so that I can document progress and decisions
38. As a user, I want to tag tickets, so that I can categorize and filter them
39. As a user, I want to attach files to tickets, so that screenshots and documents are linked to the issue

### Email Integration (IMAP + SMTP)

40. As a user, I want to configure my IMAP/SMTP credentials in settings, so that DCRM can connect to my mailbox
41. As a user, I want DCRM to sync incoming emails via IMAP, so that all client communications are in one place
42. As a user, I want to send emails from DCRM via SMTP, so that I can reply without leaving the CRM
43. As a user, I want to define authorized email addresses per client (with wildcard support), so that emails from known contacts are auto-linked
44. As a user, I want emails from authorized addresses to trigger events (so hooks can process them), so that my workflow is automated
45. As a user, I want emails from unrecognized addresses to still be gathered and accessible, so that I don't miss new contacts
46. As a user, I want to see all emails for a client or project in a threaded view, so that I can follow conversation history
47. As a user, I want my email credentials stored encrypted at rest, so that they are secure

### Event & Hook System

48. As a user, I want fixed lifecycle events per entity type (created, updated, deleted, status_changed), so that the system is predictable
49. As a user, I want to subscribe hooks to specific events, so that actions are triggered automatically
50. As a user, I want to configure AI hooks with natural language prompts, so that I can automate AI tasks without coding
51. As a user, I want to use built-in AI action templates (summarize, extract contacts, classify, etc.), so that I get started quickly
52. As a user, I want to create custom AI hooks with free-form prompts, so that I can automate any task I need
53. As a user, I want hooks to run asynchronously (fire-and-forget), so that my workflow is never blocked
54. As a user, I want to see hook execution status and results, so that I know if automations are working
55. As a user, I want AI-generated results to both auto-fill entity fields AND appear in a dedicated AI insights panel, so that I get enrichment plus full analysis
56. As a user, I want to configure outgoing webhooks that call external URLs when events fire, so that I can integrate with external tools
57. As a user, I want outgoing webhooks to retry up to 3 times on failure, so that transient network issues don't break integrations
58. As a user, I want to receive incoming webhooks from external services that trigger internal events, so that external tools can push data into DCRM
59. As a user, I want a visual payload mapping editor for incoming webhooks, so that I can map external JSON to event payloads without coding
60. As a user, I want to authenticate outgoing webhook calls with a token, so that security is maintained

### AI Integration (BYOK via TanStack AI)

61. As a user, I want to configure my own AI API keys (BYOK), so that I control costs and data privacy
62. As a user, I want to use OpenRouter as an AI provider, so that I can access many models from one key
63. As a user, I want to use OpenAI (and compatible APIs via custom base URL) as an AI provider, so that I can use OpenAI or self-hosted models
64. As a user, I want to use Anthropic (and compatible APIs via custom base URL) as an AI provider, so that I can use Claude models
65. As a user, I want to use Google as an AI provider, so that I can use Gemini models
66. As a user, I want my AI keys stored encrypted at rest, so that they are secure
67. As a user, I want to select which AI provider/model to use per hook, so that I can match model capabilities to tasks
68. As a user, I want an AI assistant chat interface for ad-hoc queries about my CRM data, so that I can ask questions about my business

### File Attachments

69. As a user, I want to attach files to any entity (client, lead, project, ticket, exchange), so that documents are always in context
70. As a user, I want files stored locally by default, so that self-hosted deployment is simple
71. As a user, I want files stored in S3-compatible storage when configured, so that hosted/scalable deployments work
72. As a user, I want to preview common file types (images, PDFs) inline, so that I don't have to download to view

### Search & Filtering

73. As a user, I want to search across all entities using basic text search, so that I can find anything quickly
74. As a user, I want to filter lists by tags, status, date range, and custom fields, so that I can narrow down results
75. As a user, I want a global search bar accessible from any page, so that I can search from anywhere

### Data Import/Export

76. As a user, I want to import clients from CSV files, so that I can migrate from other tools
77. As a user, I want to export any entity list as CSV or JSON, so that I can use data elsewhere
78. As a user, I want to export all my data as a full backup, so that I own my data

### Notifications

79. As a user, I want to see in-app notifications for important events, so that I don't miss anything
80. As a user, I want an optional daily email digest (only when there are notifications), so that I stay informed even when not logged in

### Internationalization

81. As a user, I want the UI to support multiple languages via an i18n framework, so that I can use DCRM in my language
82. As a developer, I want an i18n framework in place from v1, so that adding translations is straightforward

### Mobile (Expo)

83. As a user, I want to browse clients, projects, tickets, and emails on my phone, so that I can access info on the go
84. As a user, I want to create and edit basic entities on mobile, so that I can capture info immediately
85. As a user, I want the mobile app to share the same API as the web app, so that data is always in sync

### Desktop (Electrobun)

86. As a user, I want a desktop app that wraps the web experience, so that I have a dedicated window for DCRM

## Implementation Decisions

### Architecture Overview

The system follows the existing monorepo structure with clear separation of concerns:

- **`packages/db`** — Drizzle schema, migrations, and database connection
- **`packages/api`** — tRPC routers organized by domain (clients, projects, tickets, leads, events, hooks, email, files, search)
- **`packages/auth`** — Better Auth configuration (unchanged from bootstrap)
- **`packages/ui`** — Shared shadcn/ui components
- **`packages/env`** — Type-safe environment variables
- **`packages/event-engine`** (new) — Event definition, hook execution, webhook dispatching
- **`packages/ai`** (new) — TanStack AI adapters for OpenRouter, OpenAI, Anthropic, Google + prompt execution engine
- **`packages/email`** (new) — IMAP sync, SMTP send, email matching engine
- **`packages/storage`** (new) — File storage abstraction (local filesystem + S3)
- **`packages/crypto`** (new) — Encryption/decryption for secrets (API keys, email credentials)
- **`packages/i18n`** (new) — Internationalization framework
- **`apps/web`** — TanStack Start SSR app with all CRM pages
- **`apps/native`** — Expo mobile app with core CRUD
- **`apps/desktop`** — Electrobun wrapper (unchanged)

### Database Schema

All entities use:
- **`id`**: `text` primary key (cuid2 or nanoid)
- **`userId`**: `text` FK to `user` table (all data is user-scoped, no org/team)
- **`createdAt`** / **updatedAt`**: timestamps
- **`deletedAt`**: nullable timestamp for soft delete
- **`customFields`**: `jsonb` column for user-defined fields
- **`tags`**: `text[]` array column (flat tags)

**Core tables:**

- **`client`** — name, email, phone, company, website, notes, socialLinks (jsonb), address (jsonb), customFields (jsonb), tags, userId
- **`client_authorized_email`** — clientId, pattern (supports wildcards like `*@company.com`)
- **`lead`** — name, email, phone, company, website, notes, socialLinks (jsonb), address (jsonb), customFields (jsonb), tags, stage (enum), estimatedValue, source, userId
- **`project`** — name, description, status (enum), clientId (FK), budgetAmount, budgetCurrency, estimatedHours, actualHours, customFields (jsonb), tags, startDate, endDate, userId
- **`ticket`** — title, description, type (enum: task/bug/feature/question), status (enum), priority (enum), projectId (FK), dueDate, customFields (jsonb), tags, userId
- **`ticket_comment`** — ticketId (FK), content, userId
- **`exchange`** — type (email/note/call/meeting), direction (inbound/outbound/na), subject, body, clientId (FK, nullable), projectId (FK, nullable), externalId (for email message-id), metadata (jsonb), occurredAt, userId
- **`exchange_participant`** — exchangeId (FK), email, name, role (from/to/cc/bcc)
- **`attachment`** — entityId, entityType (polymorphic: client/lead/project/ticket/exchange), fileName, mimeType, size, storageKey, storageType (local/s3), userId
- **`tag`** — name, color, userId (optional: define tags with colors, or just use text arrays)

**Event system tables:**

- **`event_definition`** — name, entityType, trigger (created/updated/deleted/status_changed), description
- **`hook`** — name, eventDefinitionId (FK), type (ai/webhook_out), config (jsonb), enabled, userId
- **`hook_execution`** — hookId (FK), status (pending/running/success/failed), input (jsonb), output (jsonb), error, startedAt, completedAt
- **`webhook_in`** — name, path (unique auto-generated), secret, eventDefinitionId (FK), payloadMapping (jsonb — visual mapping config), enabled, userId

**Email config tables:**

- **`email_account`** — imapHost, imapPort, imapUsername, imapPassword (encrypted), smtpHost, smtpPort, smtpUsername, smtpPassword (encrypted), lastSyncedAt, userId

**AI config tables:**

- **`ai_provider`** — type (openrouter/openai/anthropic/google), label, apiKey (encrypted), baseUrl (nullable, for compatible APIs), defaultModel, userId

**Settings tables:**

- **`user_settings`** — locale, theme, dailyDigestEnabled, userId

### Event Engine Design

The event engine is the backbone of extensibility. Every write action in the system emits a typed event:

```
Event = { type: string, entity: { type, id, data }, changes?: { before, after }, userId, timestamp }
```

**Fixed lifecycle events per entity type:**
- `client.created`, `client.updated`, `client.deleted`, `client.status_changed`
- `lead.created`, `lead.updated`, `lead.deleted`, `lead.stage_changed`
- `project.created`, `project.updated`, `project.deleted`, `project.status_changed`
- `ticket.created`, `ticket.updated`, `ticket.deleted`, `ticket.status_changed`
- `exchange.received` (triggered by emails from authorized addresses)

**Hook execution flow:**
1. Action occurs (e.g., client created)
2. Event is emitted to the event bus
3. All enabled hooks subscribed to this event are loaded
4. Each hook is enqueued for async execution
5. Hook execution record is created (status: pending → running)
6. For AI hooks: TanStack AI adapter executes the prompt with event context
7. For webhook hooks: HTTP POST to configured URL with event payload
8. Results are stored in `hook_execution`
9. AI results are applied: auto-fill entity fields + store in AI insights panel
10. Webhook failures retry up to 3x with exponential backoff

### AI Integration — TanStack AI (NOT Vercel AI SDK)

**This project uses TanStack AI exclusively. The Vercel AI SDK is NOT used and must NOT be introduced as a dependency.**

The `packages/ai` module provides:
- A unified adapter interface wrapping TanStack AI providers
- First-party adapters: OpenRouter, OpenAI (+ compatible), Anthropic (+ compatible), Google
- Each adapter configured with user's BYOK key (encrypted at rest, decrypted at runtime)
- A prompt execution engine that takes a hook's prompt template + event context and produces a result
- Built-in action templates: summarize, extract_contacts, classify, translate, enrich_from_web
- Support for structured output (Zod schemas) so AI results can be mapped to entity fields

### Email Integration

- **IMAP sync**: Background job periodically polls configured mailboxes, fetches new messages since `lastSyncedAt`
- **SMTP send**: User can compose and send emails from within DCRM; these are stored as exchanges
- **Client matching**: Each client has a list of authorized email patterns (e.g., `*@acme.com`, `john@acme.com`). Incoming emails from matching addresses are auto-linked to the client and may trigger events
- **Unmatched emails**: Stored but not auto-linked. Accessible in an "Unmatched" inbox view. User can manually link them.
- **Thread tracking**: Email threading via `In-Reply-To` / `References` headers, grouped as a single exchange thread

### File Storage

- Abstraction layer in `packages/storage` with two backends:
  - **Local**: Files stored in a configurable directory on the filesystem
  - **S3**: Files stored in S3-compatible object storage (configurable endpoint for MinIO, etc.)
- Backend selected automatically: S3 if `S3_ENDPOINT` is configured, local otherwise
- Files are keyed by `{entityType}/{entityId}/{uuid}-{filename}`
- Metadata stored in `attachment` table

### Forms — Formedible

All forms in the application (except login/signup managed by Better Auth) use **Formedible** (`formedible.dev`), a schema-driven form shadcn component. This is non-negotiable. Forms are defined by JSON schemas that map to shadcn components, enabling:
- Consistent form UX across the app
- Custom fields rendered dynamically from user-defined field schemas
- AI-assisted form pre-fill from hook results

### Security — Secret Encryption

- A `MASTER_ENCRYPTION_KEY` env variable (32-byte hex) is required
- All secrets (AI API keys, IMAP/SMTP credentials) are encrypted with AES-256-GCM before storage
- Decrypted only in-memory at runtime, never logged or exposed via API
- The `packages/crypto` module handles all encrypt/decrypt operations

### Internationalization

- i18n framework established in v1 using a lightweight approach (e.g., `typesafe-i18n` or custom)
- English as default locale
- Translation keys extracted from day one
- User locale stored in `user_settings` table

### Soft Delete

- All entities have a nullable `deletedAt` timestamp
- Deleted items are excluded from default queries (scoped via Drizzle filter)
- A "Trash" view shows soft-deleted items with a restore option
- Hard delete only when explicitly purging from trash

### Deployment

- **Self-hosted**: `docker-compose.yml` with PostgreSQL + DCRM web app. User provides `.env` with `DATABASE_URL`, `BETTER_AUTH_SECRET`, `MASTER_ENCRYPTION_KEY`, optional S3 config.
- **Hosted**: Deployed on Dokploy with docker-compose. Stripe integration for €24/year subscription (v1.1+ for billing).

### Mobile App (Expo)

- Core CRUD: create/view/edit clients, projects, tickets
- View emails (read-only)
- No settings/hooks/AI config on mobile
- Shares tRPC API with web app

### Desktop App (Electrobun)

- Thin wrapper around the web app (already bootstrapped)
- No additional native features in v1

## Testing Decisions

### What Makes a Good Test

- Tests verify external behavior, not implementation details
- Integration tests against a real PostgreSQL database (via Docker test container)
- API layer tested via tRPC caller (no HTTP overhead)
- Event engine tested by asserting hook execution results given known events
- Email matching tested with pattern-matching unit tests

### Modules to Test

| Module | Test Type | Priority |
|---|---|---|
| `packages/event-engine` | Unit + Integration | High — core extensibility |
| `packages/ai` | Unit (mocked providers) | High — critical path |
| `packages/email` | Unit (pattern matching) + Integration (IMAP mock) | High |
| `packages/crypto` | Unit | High — security critical |
| `packages/storage` | Integration | Medium |
| `packages/api` (routers) | Integration (tRPC caller + test DB) | High |
| `packages/db` (schema) | Integration (migration tests) | Medium |

### Prior Art

- The existing tRPC setup uses `protectedProcedure` which checks session — tests will need to mock auth context
- Drizzle supports in-memory SQLite for basic query tests, but PostgreSQL-specific features (jsonb, text arrays) need a real PG instance

## Out of Scope (v1)

- **Billing/subscription system** — Stripe integration for hosted version (v1.1)
- **Audit trail / activity log** — Not in v1
- **OAuth login** (Google, etc.) — Email/password only
- **Full mobile feature parity** — Core CRUD only
- **Desktop native features** — Web wrapper only
- **Advanced search** (full-text, semantic) — Basic ILIKE search only
- **Time tracking timer** — Manual hour logging only
- **Invoicing** — Budget tracking only, door left open for external integrations via webhooks
- **Multi-user / org / team** — Single user only
- **Push notifications** — In-app + daily email only

## Further Notes

### Phasing

**v1 (MUST-HAVE):** Core CRM entities (clients, projects, tickets, tags), lead pipeline, email integration (IMAP+SMTP), event & hook system (AI hooks + webhooks), file attachments, i18n framework.

**v1.1:** Billing/subscription (Stripe), advanced AI chat assistant, audit trail, CSV/JSON import for all entities, push notifications.

**v2:** Mobile offline mode, desktop native features (notifications, system tray), advanced reporting, marketplace for hook templates.

### Critical Reminder: TanStack AI, NOT Vercel AI SDK

Throughout development, the AI integration MUST use **TanStack AI** (the TanStack-branded AI library). The Vercel AI SDK (`ai` npm package) is NOT to be used under any circumstances. All AI adapters, streaming, tool calling, and structured output must go through TanStack AI's API. This decision is final and non-negotiable.

### Critical Reminder: Formedible

All forms (except Better Auth login/signup) MUST use Formedible (`formedible.dev`). This is a schema-driven form component built on shadcn. It must be used for every create/edit form in the application.
