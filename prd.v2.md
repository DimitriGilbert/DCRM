# DCRM — Product Requirements Document v2

> **Micro CRM for Independent Contractors & Freelancers**
> Open-source, self-hostable, AI-powered. Hosted version at €24/year.

---

## Problem Statement

Independent contractors, freelancers, and solo consultants juggle clients, projects, communications, and prospecting without a lightweight, affordable tool. Existing CRMs are either enterprise-focused (too complex, too expensive) or too simplistic (glorified contact lists). There is no open-source CRM that natively integrates AI assistance, email communication tracking, and an extensible event/hook system — all targeted at a single user, not a team.

## Solution

DCRM is a micro CRM designed for solo professionals who need to manage their entire client lifecycle — from lead prospecting to active project delivery — in one place. It provides:

- **Client management** with rich contact info, social links, addresses, custom fields, and tags
- **Lead pipeline** to track prospects from first contact to conversion (archived on win, client created)
- **Project & ticket tracking** with fixed status enums, budgets per-entity currency, and hours logging
- **Unified exchange timeline** — emails, calls, meetings, and ticket comments (which can be emailed to clients) in one chronological view per entity. Notes are internal-only and never sent externally.
- **Email integration** via IMAP/SMTP with smart client matching and loop prevention
- **AI-powered hooks** (BYOK) that react to lifecycle events and enrich data
- **Extensible event/webhook system** for both outgoing (configurable auth) and incoming (visual payload mapper) integrations
- **AI chat assistant** with multi-turn conversation and CRM data tools
- **Multi-platform**: web (TanStack Start), desktop (Electrobun), mobile (Expo)
- **Public tRPC API** with API key access for external integrations
- **Stripe billing** (€24/year recurring) with optional activation for self-hosted

All built on a modern, type-safe stack: TanStack Start + tRPC + Drizzle + PostgreSQL + Better Auth + shadcn + Formedible.

## Tech Stack (Already Bootstrapped)

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web app | TanStack Start (SSR) + Vite |
| API | tRPC v11 (internal + public) |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Better Auth (email/password) + API keys |
| UI | shadcn/ui (base-lyra) + TailwindCSS v4 |
| Forms | **Formedible** (schema-driven shadcn component) |
| Desktop | Electrobun (web wrapper) |
| Mobile | Expo + Uniwind |
| AI | **TanStack AI** (NOT Vercel AI SDK — non-negotiable) |
| Job Queue | BullMQ + Redis |
| Billing | Stripe (recurring subscriptions) |
| Deployment | Dokploy + docker-compose |

## User Stories

### Authentication & Onboarding

1. As a user, I want to sign up with email and password, so that I can create my account
2. As a user, I want to log in and out securely, so that my data is protected
3. As a user, I want a guided onboarding wizard after first login (set language → configure AI keys → configure email → done), with each step skippable, so that I can hit the ground running
4. As a self-hoster, I want to deploy with a single `docker-compose up` and a `.env` file, so that setup takes 5 minutes

### Dashboard

5. As a user, I want a dashboard with fixed cards showing active clients count, active projects, open tickets, pipeline summary (leads per stage), upcoming deadlines, and recent activity feed, so that I immediately know the state of my business
6. As a user, I want quick-action buttons on the dashboard (add client, add lead, add project), so that I can work efficiently

### Client Management

7. As a user, I want to create clients with name, email, phone, company name, website, notes, so that I have a complete contact record
8. As a user, I want to add social media links (LinkedIn, Twitter/X, etc.) to clients, so that I can reach them on their preferred channels
9. As a user, I want to add postal addresses to clients, so that I have info needed for invoicing and shipping
10. As a user, I want to define custom fields on clients (text, number, date, select, checkbox, textarea, url), so that I can track info specific to my business
11. As a user, I want to see a unified timeline of all exchanges (emails, calls, meetings, ticket comments, notes) on each client's detail page, so that I have full context
12. As a user, I want to tag clients using a tag system with name and color, so that I can categorize and filter them
13. As a user, I want to soft-delete clients and restore them from trash, so that I don't accidentally lose data
14. As a user, I want to search across clients by name, email, company using ILIKE, so that I can find contacts quickly
15. As a user, I want to see AI-enriched data on client profiles, so that I have insights without manual research
16. As a user, I want each project/lead to have its own currency field (no conversion), so that I can work in whatever currency makes sense

### Lead Pipeline

17. As a user, I want to create leads with the same fields as clients plus pipeline stage, estimated value (with currency), and source, so that I can track prospects before they become clients
18. As a user, I want to move leads through fixed pipeline stages (New, Contacted, Qualified, Proposal, Won, Lost), so that I can visualize my sales funnel
19. As a user, I want to convert a won lead into a client with one click (lead is archived with 'converted' status, client is created with lead data), so that I don't have to re-enter data
20. As a user, I want to see my lead pipeline as a visual kanban board, so that I can drag-and-drop leads between stages
21. As a user, I want to see pipeline statistics (conversion rate, average deal value), so that I can improve my prospecting

### Project Management

22. As a user, I want to create projects tied to a specific client, so that work is organized per client
23. As a user, I want to set a budget (amount + currency, per-entity) and estimated hours on projects, so that I can track financials
24. As a user, I want to log actual hours against a project, so that I can compare estimate vs reality
25. As a user, I want project status as a fixed enum (Planning, Active, On-hold, Completed, Archived), so that I know where things stand
26. As a user, I want to define custom fields on projects (text, number, date, select, checkbox, textarea, url), so that I can track project-specific metadata
27. As a user, I want to tag projects using the tag system, so that I can categorize and filter them
28. As a user, I want to see a unified timeline of all exchanges related to a project, so that I have full context
29. As a user, I want to attach files to projects, so that contracts, specs, and deliverables are stored centrally

### Ticket / Issue Management

30. As a user, I want to create issues with fixed types (task, bug, feature, question) within a project, so that I can track all work items
31. As a user, I want to set ticket statuses (New, In Progress, Waiting, Resolved, Closed), so that the workflow matches my process
32. As a user, I want to set priority on tickets (low, medium, high, critical), so that I can triage effectively
33. As a user, I want to assign due dates to tickets, so that I can track deadlines
34. As a user, I want to see tickets in a list or kanban view, so that I can work the way I prefer
35. As a user, I want to add comments to tickets, which are stored as exchanges and can be emailed to the client, so that I communicate progress
36. As a user, I want client replies to ticket comment emails to automatically create new comments on the ticket, so that the conversation stays in context
37. As a user, I want to add internal notes to tickets (never sent to client), so that I can track private thoughts
38. As a user, I want to tag tickets using the tag system, so that I can categorize and filter them
39. As a user, I want to attach files to tickets, so that screenshots and documents are linked to the issue

### Exchanges (Unified Timeline)

40. As a user, I want to see a unified chronological timeline per entity (client/project/ticket) showing all exchanges: emails, calls, meetings, ticket comments, and internal notes
41. As a user, I want exchange types to be: email, note, call, meeting, comment (ticket comments that can be emailed to clients)
42. As a user, I want notes to be internal-only and never sent to external contacts, so that my private thoughts stay private
43. As a user, I want to manually log calls and meetings as exchanges, so that I have a record of all interactions

### Email Integration (IMAP + SMTP)

44. As a user, I want to configure my IMAP/SMTP credentials in settings, so that DCRM can connect to my mailbox
45. As a user, I want DCRM to sync incoming emails via IMAP at a configurable interval (default 5 minutes), so that all client communications are in one place
46. As a user, I want to send plain-text emails from DCRM via SMTP, so that I can reply without leaving the CRM
47. As a user, I want to define authorized email addresses per client (with wildcard support like `*@company.com`), so that emails from known contacts are auto-linked
48. As a user, I want emails from authorized addresses to trigger events (so hooks can process them), so that my workflow is automated
49. As a user, I want emails from unrecognized addresses to still be gathered and accessible in an "Unmatched" inbox, so that I don't miss new contacts
50. As a user, I want to see all emails for a client or project in a threaded view, so that I can follow conversation history
51. As a user, I want my email credentials stored encrypted at rest (AES-256-GCM), so that they are secure
52. As a user, I want outgoing emails from DCRM to include an `X-DCRM-Sent: true` header, so that IMAP sync doesn't re-import sent emails (loop prevention)

### Event & Hook System

53. As a user, I want fixed lifecycle events per entity type (created, updated, deleted, status_changed), so that the system is predictable
54. As a user, I want to subscribe multiple hooks to specific events, so that actions are triggered automatically
55. As a user, I want hooks subscribed to the same event to execute in parallel (fire-all), so that throughput is maximized
56. As a user, I want to configure AI hooks with natural language prompts + a Zod structured output schema, so that AI results can be reliably mapped to entity fields
57. As a user, I want to define field mappings per AI hook (structured output fields → entity fields), so that AI results auto-fill the right data
58. As a user, I want to use built-in AI action templates (summarize, extract_contacts, classify, enrich_from_web), so that I get started quickly
59. As a user, I want to create custom AI hooks with free-form prompts + custom output schemas, so that I can automate any task I need
60. As a user, I want hooks to run asynchronously via BullMQ job queue, so that my workflow is never blocked and retries work across crashes
61. As a user, I want to see hook execution status and results in a management UI (silent log + status indicator), so that I know if automations are working
62. As a user, I want failed hooks to show a failure indicator in the UI without spamming notifications, so that I'm aware but not annoyed
63. As a user, I want AI-generated results to both auto-fill entity fields AND appear in a dedicated AI insights panel, so that I get enrichment plus full analysis
64. As a user, I want to configure outgoing webhooks with configurable authentication per webhook (Bearer token, Basic auth, HMAC signature, custom headers), so that I can integrate with any external tool
65. As a user, I want outgoing webhooks to retry up to 3 times on failure with exponential backoff, so that transient network issues don't break integrations
66. As a user, I want to receive incoming webhooks from external services via unique auto-generated URLs with secret-based verification, so that external tools can push data into DCRM
67. As a user, I want a visual JSON path mapping editor for incoming webhooks (drag lines from source JSON paths to target event fields), so that I can map external payloads without coding
68. As a user, I want incoming webhook payload mappings stored as configurable JSON, so that they're versionable and portable

### AI Integration (BYOK via TanStack AI)

69. As a user, I want to configure my own AI API keys (BYOK), so that I control costs and data privacy
70. As a user, I want to use OpenRouter as an AI provider, so that I can access many models from one key
71. As a user, I want to use OpenAI (and compatible APIs via custom base URL) as an AI provider, so that I can use OpenAI or self-hosted models
72. As a user, I want to use Anthropic (and compatible APIs via custom base URL) as an AI provider, so that I can use Claude models
73. As a user, I want to use Google as an AI provider, so that I can use Gemini models
74. As a user, I want my AI keys stored encrypted at rest (AES-256-GCM), so that they are secure
75. As a user, I want to select which AI provider/model to use per hook, so that I can match model capabilities to tasks
76. As a user, I want a multi-turn AI assistant chat interface with conversation history, so that I can have a dialogue about my business data
77. As a user, I want the AI chat assistant to access my CRM data through server-side tools (not tRPC procedures), so that I have fine-grained control over what the AI can do
78. As a user, I want the AI chat to be able to search clients, summarize projects, report on ticket status, and analyze my pipeline, so that I get real insights from my data

### File Attachments

79. As a user, I want to attach files to any entity (client, lead, project, ticket, exchange), so that documents are always in context
80. As a user, I want files stored locally by default, so that self-hosted deployment is simple
81. As a user, I want files stored in S3-compatible storage when configured, so that hosted/scalable deployments work
82. As a user, I want to preview common file types (images, PDFs) inline, so that I don't have to download to view
83. As a user, I want a per-file upload size limit configurable via env var, and a total storage quota per user configurable via env var (default 250MB), so that storage is managed

### Search & Filtering

84. As a user, I want to search across all entities using ILIKE on core fields (name, email, company, subject), so that I can find anything quickly
85. As a user, I want to filter lists by tags, status, date range, so that I can narrow down results
86. As a user, I want a global search bar accessible from any page, so that I can search from anywhere

### Data Import/Export

87. As a user, I want to import clients from CSV files, so that I can migrate from other tools
88. As a user, I want to export any entity list as CSV or JSON, so that I can use data elsewhere
89. As a user, I want to export all my data as a full backup, so that I own my data

### Notifications

90. As a user, I want in-app notifications for important events, so that I don't miss anything (displayed via a notification bell)

### Internationalization

91. As a user, I want the UI to support multiple languages via an i18n framework, so that I can use DCRM in my language
92. As a developer, I want an i18n framework in place from v1 with English as default, so that adding translations is straightforward

### Mobile (Expo)

93. As a user, I want to browse clients, projects, tickets, and emails on my phone, so that I can access info on the go
94. As a user, I want to create and edit basic entities on mobile (no settings, hooks, AI config, or billing), so that I can capture info immediately
95. As a user, I want the mobile app to share the same tRPC API as the web app, so that data is always in sync

### Desktop (Electrobun)

96. As a user, I want a desktop app that wraps the web experience, so that I have a dedicated window for DCRM

### Public API

97. As a user, I want to generate simple API keys (name, created date, last used date, full access scope) in settings, so that I can integrate external tools
98. As a user, I want to access all tRPC procedures via API key auth, so that I can programmatically manage my CRM data

### Settings & Preferences

99. As a user, I want to toggle between Light/Dark/System theme, so that the UI matches my preference
100. As a user, I want to configure email sync interval in settings, so that I control how often IMAP polls
101. As a user, I want to manage my AI provider keys in a dedicated settings page, so that BYOK configuration is centralized

### Billing (Hosted + Optional Self-Hosted)

102. As a hosted user, I want to subscribe to DCRM at €24/year via Stripe recurring subscription, so that I get access to the service
103. As a hosted user, I want to manage my subscription (view status, cancel) in settings, so that I'm in control
104. As a self-hoster, I want to optionally enable Stripe billing via env vars, so that I can charge users on my own hosted instance

## Implementation Decisions

### Architecture Overview

The system follows the existing monorepo structure with clear separation of concerns:

- **`packages/db`** — Drizzle schema, migrations, and database connection. All CRM, event, AI, email, and billing tables.
- **`packages/api`** — tRPC routers organized by domain (clients, projects, tickets, leads, exchanges, events, hooks, email, files, search, billing, ai-chat). Public API key auth alongside session auth.
- **`packages/auth`** — Better Auth configuration + API key generation and validation.
- **`packages/ui`** — Shared shadcn/ui components + Formedible integration.
- **`packages/env`** — Type-safe environment variables.
- **`packages/event-engine`** (new) — Event definition, BullMQ-backed hook execution, webhook dispatching.
- **`packages/ai`** (new) — TanStack AI adapters (OpenRouter, OpenAI, Anthropic, Google) + prompt execution engine + structured output + CRM tools for AI chat.
- **`packages/email`** (new) — IMAP sync, SMTP send, client matching, X-DCRM header loop prevention.
- **`packages/storage`** (new) — File storage abstraction (local filesystem + S3).
- **`packages/crypto`** (new) — AES-256-GCM encryption/decryption for secrets.
- **`packages/i18n`** (new) — Internationalization framework.
- **`packages/billing`** (new) — Stripe subscription management (optional, env-gated).
- **`apps/web`** — TanStack Start SSR app with all CRM pages.
- **`apps/native`** — Expo mobile app with core CRUD + email view.
- **`apps/desktop`** — Electrobun wrapper.

### Database Schema

All entities use:
- **`id`**: `text` primary key (cuid2 or nanoid)
- **`userId`**: `text` FK to `user` table (all data is user-scoped, no org/team)
- **`createdAt`** / **`updatedAt`**: timestamps
- **`deletedAt`**: nullable timestamp for soft delete
- **`customFields`**: `jsonb` column for user-defined fields (6-7 types: text, number, date, select, checkbox, textarea, url)

**Core tables:**

- **`client`** — name, email, phone, company, website, notes, socialLinks (jsonb), address (jsonb), customFields (jsonb), userId
- **`client_authorized_email`** — clientId, pattern (supports wildcards like `*@company.com`)
- **`lead`** — name, email, phone, company, website, notes, socialLinks (jsonb), address (jsonb), customFields (jsonb), stage (enum: New/Contacted/Qualified/Proposal/Won/Lost), estimatedValue (numeric), estimatedCurrency (text), source, userId
- **`project`** — name, description, status (enum: Planning/Active/On-hold/Completed/Archived), clientId (FK), budgetAmount (numeric), budgetCurrency (text), estimatedHours (numeric), actualHours (numeric), customFields (jsonb), startDate, endDate, userId
- **`ticket`** — title, description, type (enum: task/bug/feature/question), status (enum: New/In Progress/Waiting/Resolved/Closed), priority (enum: low/medium/high/critical), projectId (FK), dueDate, customFields (jsonb), userId
- **`exchange`** — type (enum: email/note/call/meeting/comment), direction (inbound/outbound/na), subject, body, clientId (FK, nullable), projectId (FK, nullable), ticketId (FK, nullable), externalId (for email message-id), metadata (jsonb), occurredAt, userId
- **`exchange_participant`** — exchangeId (FK), email, name, role (from/to/cc/bcc)
- **`attachment`** — entityId, entityType (polymorphic: client/lead/project/ticket/exchange), fileName, mimeType, size, storageKey, storageType (local/s3), userId
- **`tag`** — name, color, userId
- **`entity_tag`** — tagId (FK), entityId, entityType (polymorphic junction)

**Event system tables:**

- **`event_definition`** — name, entityType, trigger (created/updated/deleted/status_changed), description
- **`hook`** — name, eventDefinitionId (FK), type (ai/webhook_out), config (jsonb), outputSchema (jsonb — Zod schema for AI hooks), fieldMapping (jsonb — maps output fields to entity fields), enabled, userId
- **`hook_execution`** — hookId (FK), status (pending/running/success/failed), input (jsonb), output (jsonb), error, startedAt, completedAt
- **`webhook_in`** — name, path (unique auto-generated), secret, eventDefinitionId (FK), payloadMapping (jsonb — visual mapping config), enabled, userId

**Email config tables:**

- **`email_account`** — imapHost, imapPort, imapUsername, imapPassword (encrypted), smtpHost, smtpPort, smtpUsername, smtpPassword (encrypted), syncInterval (integer, minutes, default 5), lastSyncedAt, userId

**AI config tables:**

- **`ai_provider`** — type (openrouter/openai/anthropic/google), label, apiKey (encrypted), baseUrl (nullable, for compatible APIs), defaultModel, userId
- **`ai_chat_message`** — role (user/assistant/system), content, context (jsonb — entities referenced), userId, createdAt

**Auth tables:**

- **`api_key`** — name, keyHash, lastUsedAt, userId, createdAt

**Billing tables:**

- **`subscription`** — stripeCustomerId, stripeSubscriptionId, status (active/past_due/canceled/incomplete), currentPeriodStart, currentPeriodEnd, userId

**Settings tables:**

- **`user_settings`** — locale, theme (light/dark/system), dailyDigestEnabled, storageQuotaBytes, userId

### Event Engine Design

The event engine is the backbone of extensibility. Every write action in the system emits a typed event:

```
Event = { type: string, entity: { type, id, data }, changes?: { before, after }, userId, timestamp }
```

**Fixed lifecycle events per entity type:**
- `client.created`, `client.updated`, `client.deleted`
- `lead.created`, `lead.updated`, `lead.deleted`, `lead.stage_changed`
- `project.created`, `project.updated`, `project.deleted`, `project.status_changed`
- `ticket.created`, `ticket.updated`, `ticket.deleted`, `ticket.status_changed`
- `exchange.received` (triggered by emails from authorized addresses)

**Hook execution flow:**
1. Action occurs (e.g., client created)
2. Event is emitted to the event bus
3. All enabled hooks subscribed to this event are loaded
4. Each hook is enqueued as a BullMQ job for async execution (parallel, fire-all)
5. Hook execution record is created (status: pending → running)
6. For AI hooks: TanStack AI adapter executes the prompt with event context, validates output against the hook's Zod output schema
7. For webhook hooks: HTTP POST to configured URL with event payload (configurable auth: Bearer/Basic/HMAC/custom headers)
8. Results are stored in `hook_execution`
9. AI results are applied: auto-fill entity fields via field mapping + store in AI insights panel
10. Webhook failures retry up to 3x with exponential backoff via BullMQ built-in retry
11. Failed hooks show a failure indicator in the hook management UI (silent log, no notification spam)

### AI Integration — TanStack AI (NOT Vercel AI SDK)

**This project uses TanStack AI exclusively. The Vercel AI SDK (`ai` npm package) is NOT used and must NOT be introduced as a dependency. This is non-negotiable.**

The `packages/ai` module provides:
- A unified adapter interface wrapping TanStack AI providers
- First-party adapters: OpenRouter, OpenAI (+ compatible via baseUrl), Anthropic (+ compatible via baseUrl), Google
- Each adapter configured with user's BYOK key (encrypted at rest via `packages/crypto`, decrypted at runtime)
- A prompt execution engine that takes a hook's prompt template + event context and produces structured output
- Built-in action templates: summarize, extract_contacts, classify, enrich_from_web
- Structured output via Zod schemas so AI results can be mapped to entity fields via the hook's field mapping config
- **AI Chat Assistant**: Multi-turn conversational interface with conversation history stored in `ai_chat_message`. Server-side AI calls use custom CRM tools (not tRPC procedures) for fine-grained data access control. Tools include: search_clients, get_project_status, list_open_tickets, pipeline_summary, etc.

### Email Integration

- **IMAP sync**: BullMQ scheduled job polls configured mailboxes at user-configured interval (default 5 min), fetches new messages since `lastSyncedAt`
- **SMTP send**: User composes plain-text emails from within DCRM; stored as exchanges of type `comment` when sent from a ticket context
- **Loop prevention**: All outgoing emails include `X-DCRM-Sent: true` header. IMAP sync skips any email with this header.
- **Client matching**: Each client has a list of authorized email patterns (e.g., `*@acme.com`, `john@acme.com`). Incoming emails from matching addresses are auto-linked to the client and may trigger events.
- **Ticket comment emails**: When a ticket comment is sent to a client via email, the client's reply (matched by In-Reply-To header) is stored as a new comment exchange on the ticket.
- **Unmatched emails**: Stored but not auto-linked. Accessible in an "Unmatched" inbox view. User can manually link them.
- **Thread tracking**: Email threading via `In-Reply-To` / `References` headers, grouped as a single exchange thread.

### Ticket Comments as Exchanges

Ticket comments are stored as exchanges with `type: 'comment'` and a `ticketId` FK. This means:
- Comments appear in the unified timeline for both the ticket and the parent client/project
- Comments can be emailed to the client via SMTP (direction: outbound)
- Client replies are auto-matched and create new comment exchanges (direction: inbound)
- Internal notes have `type: 'note'` and are NEVER sent externally

### Tag System

Tags use a many-to-many relationship:
- **`tag`** table: name, color, userId
- **`entity_tag`** junction table: tagId, entityId, entityType (polymorphic)
- Entities that support tags: client, lead, project, ticket
- Tag management UI allows creating, renaming, and recoloring tags
- Tag list is global per user (shared across entity types)

### Lead Conversion

When a lead reaches the "Won" stage and is converted:
1. Lead record is updated with stage = 'Won' and a `convertedAt` timestamp
2. A new client record is created with lead data copied over
3. The lead remains visible in pipeline history (archived, not deleted)
4. Any attachments on the lead are re-linked to the new client

### Currency Handling

Each monetary field (project budget, lead estimated value) includes an accompanying currency text field (e.g., `budgetCurrency: 'EUR'`). The system stores and displays the value with its currency unit. No conversion rates, no multi-currency arithmetic. The user decides what currency to use per entity.

### File Storage

- Abstraction layer in `packages/storage` with two backends:
  - **Local**: Files stored in a configurable directory on the filesystem
  - **S3**: Files stored in S3-compatible object storage (configurable endpoint for MinIO, etc.)
- Backend selected automatically: S3 if `S3_ENDPOINT` is configured, local otherwise
- Files are keyed by `{entityType}/{entityId}/{uuid}-{filename}`
- Metadata stored in `attachment` table
- Per-file size limit configurable via `MAX_FILE_SIZE_BYTES` env var
- Total storage quota per user configurable via `DEFAULT_STORAGE_QUOTA_BYTES` env var (default 250MB)

### Public tRPC API

- The existing tRPC router is exposed publicly with an additional auth middleware for API keys
- `protectedProcedure` checks for session OR valid API key
- API keys are simple tokens: user creates them in settings with a name, gets a key string (shown once)
- Keys are hashed at rest (like passwords). Verified by comparing hash.
- Full access scope (no per-key permissions in v1)
- API key record tracks `lastUsedAt` for housekeeping

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

### Outgoing Webhook Authentication

Each outgoing webhook has configurable authentication:
- **Bearer**: `Authorization: Bearer <token>` — user provides the token
- **Basic**: `Authorization: Basic <encoded>` — user provides username + password
- **HMAC**: HMAC-SHA256 signature of the payload — user provides the secret
- **Custom headers**: User defines arbitrary key-value headers

Auth type and credentials are stored in the hook's `config` jsonb field (encrypted values in a dedicated sub-field).

### Incoming Webhook Payload Mapping

The visual JSON path mapping editor allows users to:
- See the incoming JSON payload structure (user can paste a sample)
- Define source paths (e.g., `data.object.email`) using JSON path notation
- Map each source path to a target event field (e.g., `clientEmail`)
- The mapping config is stored as JSON in `webhook_in.payloadMapping`

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

### Multi-Tenancy (Hosted Version)

- Single PostgreSQL database, all users share tables
- Data isolation via `userId` FK on every entity
- All tRPC queries automatically filter by the authenticated user's ID
- No cross-user data access possible through the API

### Billing — Stripe Integration

- Stripe Checkout for subscription signup (€24/year recurring)
- Stripe Webhook handling for subscription status updates (active, past_due, canceled, etc.)
- Subscription status checked on API middleware for hosted version
- Billing is env-gated: `STRIPE_SECRET_KEY` must be configured for billing to activate
- Self-hosted version runs without billing if `STRIPE_SECRET_KEY` is not set
- Billing middleware only applied when `BILLING_ENABLED=true` in env

### Theme

- Three modes: Light, Dark, System (auto-detect OS preference)
- Stored in `user_settings.theme`
- Implemented via CSS variables + TailwindCSS dark mode
- Uses `next-themes` or equivalent for TanStack Start

### Deployment

- **Self-hosted**: `docker-compose.yml` with PostgreSQL + Redis + DCRM web app. User provides `.env` with `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `MASTER_ENCRYPTION_KEY`, optional `S3_*` config, optional `STRIPE_*` config.
- **Hosted**: Deployed on Dokploy with docker-compose. Includes PostgreSQL, Redis, DCRM web app, and Stripe billing.

### Onboarding Wizard

After first login, a multi-step wizard guides the user:
1. **Language selection** — Choose UI language
2. **AI provider setup** — Configure at least one AI provider key (skippable)
3. **Email setup** — Configure IMAP/SMTP credentials (skippable)
4. **Done** — Redirect to dashboard

Each step has a "Skip" button. The wizard is shown only once (flagged in `user_settings`).

### Mobile App (Expo)

- Core CRUD: create/view/edit clients, projects, tickets
- View emails (read-only)
- No settings, hooks, AI config, or billing on mobile
- Shares tRPC API with web app
- Uses Uniwind for styling

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
| `packages/event-engine` | Unit + Integration (BullMQ mock) | High — core extensibility |
| `packages/ai` | Unit (mocked providers), Integration (structured output) | High — critical path |
| `packages/email` | Unit (pattern matching, X-DCRM header) + Integration (IMAP mock) | High |
| `packages/crypto` | Unit (encrypt/decrypt roundtrip) | High — security critical |
| `packages/billing` | Integration (Stripe webhook handling) | High |
| `packages/storage` | Integration (local + S3 mock) | Medium |
| `packages/api` (routers) | Integration (tRPC caller + test DB) | High |
| `packages/db` (schema) | Integration (migration tests) | Medium |
| `packages/auth` (API keys) | Unit (hash/verify) | High |

### Prior Art

- The existing tRPC setup uses `protectedProcedure` which checks session — tests will need to mock auth context or create test sessions
- Drizzle supports in-memory SQLite for basic query tests, but PostgreSQL-specific features (jsonb, text arrays) need a real PG instance

## Out of Scope (v1)

- **Audit trail / activity log** — Not in v1
- **OAuth login** (Google, etc.) — Email/password only
- **Full mobile feature parity** — Core CRUD + email view only
- **Desktop native features** — Web wrapper only
- **Advanced search** (full-text tsvector, semantic, jsonb custom field search) — ILIKE on core fields only
- **Time tracking timer** — Manual hour logging only
- **Invoicing** — Budget tracking only, door left open for external integrations via webhooks
- **Multi-user / org / team** — Single user only
- **Push notifications** — In-app only in v1
- **Daily email digest** — In-app notifications only in v1
- **Rich text email composer** — Plain text only in v1
- **Custom project/ticket statuses** — Fixed enums only
- **API key scoping** — Full access tokens only in v1

## Further Notes

### Phasing

**v1 (MUST-HAVE):** Core CRM entities (clients, projects, tickets, tags), lead pipeline, email integration (IMAP+SMTP), event & hook system (AI hooks + webhooks), file attachments, AI chat assistant, public tRPC API, Stripe billing, onboarding wizard, i18n framework, in-app notifications, full import/export.

**v1.1:** Daily email digest, audit trail, rich text email composer, advanced AI chat features (proactive suggestions), push notifications.

**v2:** Mobile offline mode, desktop native features (notifications, system tray), advanced reporting/dashboard customization, marketplace for hook templates, API key scoping.

### Critical Reminder: TanStack AI, NOT Vercel AI SDK

Throughout development, the AI integration MUST use **TanStack AI** (the TanStack-branded AI library). The Vercel AI SDK (`ai` npm package) is NOT to be used under any circumstances. All AI adapters, streaming, tool calling, and structured output must go through TanStack AI's API. This decision is final and non-negotiable.

### Critical Reminder: Formedible

All forms (except Better Auth login/signup) MUST use Formedible (`formedible.dev`). This is a schema-driven form component built on shadcn. It must be used for every create/edit form in the application.

### Critical Reminder: BullMQ + Redis

Hook execution, email sync, and other background jobs MUST use BullMQ backed by Redis. This ensures reliability (retry on crash), observability (job status), and scalability. Redis is a required dependency for all deployments.
