# DCRM - Product Requirements Document v3

> Micro CRM for independent contractors and solo workers.
> Open-source, self-hostable, hosted at $24/year.

## Problem Statement

Independent contractors, freelancers, and solo consultants need a small, focused CRM that helps them manage clients, prospects, projects, issues, and exchanges without adopting an enterprise sales platform or a team collaboration tool.

Most CRM tools are either too heavy, too expensive, too team-oriented, or too limited. Solo workers need a system that keeps client context in one place, supports prospecting, records communication history, automates repetitive work, and remains simple enough to self-host or use as a low-cost hosted service.

DCRM must be built for individuals only. There are no organizations, no teams, no shared workspaces, and no collaboration features. Every data record belongs directly to one user.

## Solution

DCRM is a micro CRM for contractors and independent workers. It manages clients, leads, projects, tickets/issues, exchanges, files, and automations in a clean, extensible monorepo.

The system is open source and self-hostable, with a hosted version offered at $24/year. Hosted deployment runs on Dokploy using docker-compose. Self-hosted deployment also uses docker-compose and should be straightforward for a technical user.

The application stack is already bootstrapped and configured for basic usage:

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | TanStack Start + React + Vite |
| API | tRPC |
| Database | PostgreSQL + Drizzle |
| Auth | Better Auth |
| UI | shadcn/ui + Tailwind CSS |
| Forms | Formedible, from formedible.dev |
| Desktop | Electrobun |
| Mobile | Expo + Uniwind |
| AI | TanStack AI only |
| Background jobs | BullMQ + Redis |
| Deployment | Dokploy + docker-compose |

The AI integration is BYOK only. The supported first-party adapters are OpenRouter, OpenAI with compatible APIs through custom base URL, Anthropic with compatible APIs through custom base URL, and Google.

The AI integration must use TanStack AI. It must not use the Vercel AI SDK. Do not add the Vercel AI SDK `ai` package. Do not use Vercel AI SDK imports, examples, abstractions, or terminology as implementation guidance. TanStack AI is the required AI layer.

Every meaningful action in the program emits a typed event. Hooks subscribe to events and can run built-in automations, AI actions, outgoing webhooks, or other supported actions. Incoming webhooks from external services are mapped into internal DCRM events, and those events then trigger the same hook system.

All application forms use Formedible, except login/logout/signup flows managed by Better Auth.

## User Stories

### Authentication And Account

1. As a user, I want to sign up with email and password, so that I can create my personal CRM account.
2. As a user, I want to log in and out securely, so that my client data is protected.
3. As a user, I want all CRM data scoped directly to my user account, so that the product stays single-user and does not introduce teams or organizations.
4. As a user, I want an onboarding flow after first login, so that I can choose language, optionally configure AI, optionally configure email, and start using the CRM quickly.
5. As a self-hoster, I want deployment through docker-compose, so that I can run DCRM without a managed platform.
6. As a hosted user, I want a low yearly subscription at $24/year, so that the hosted service remains affordable.

### Dashboard

7. As a user, I want a dashboard showing active clients, active projects, open tickets, lead pipeline summary, upcoming deadlines, and recent activity, so that I can understand my business at a glance.
8. As a user, I want quick actions for creating clients, leads, projects, and tickets, so that common actions are fast.
9. As a user, I want recent events and exchanges visible from the dashboard, so that I can resume work quickly.

### Clients

10. As a user, I want to create clients with name, email, phone, company, website, notes, social links, and address, so that each client profile is complete.
11. As a user, I want to define custom client fields, so that the CRM adapts to my business.
12. As a user, I want to tag clients, so that I can categorize and filter them.
13. As a user, I want to soft-delete and restore clients, so that accidental deletion is reversible.
14. As a user, I want to search clients by name, email, company, and website, so that I can find records quickly.
15. As a user, I want to view a complete client timeline, so that I can see all related emails, notes, calls, meetings, ticket comments, projects, and files.
16. As a user, I want AI-enriched client insights, so that I can discover useful context from websites, exchanges, and notes.

### Leads And Prospecting

17. As a user, I want to create leads with client-like fields plus source, stage, estimated value, and currency, so that I can track prospects before they become clients.
18. As a user, I want fixed pipeline stages, so that lead tracking stays simple and predictable.
19. As a user, I want a kanban pipeline view, so that I can move leads visually.
20. As a user, I want lead statistics such as conversion rate and estimated value, so that I can understand my prospecting pipeline.
21. As a user, I want to convert a won lead into a client, so that I do not duplicate data entry.
22. As a user, I want converted leads preserved as history, so that my pipeline records remain accurate.

### Projects

23. As a user, I want to create projects tied to clients, so that work is organized by relationship.
24. As a user, I want project status values, so that I can track whether a project is planning, active, on hold, completed, or archived.
25. As a user, I want project budgets with per-project currency, so that I can track financial expectations without currency conversion complexity.
26. As a user, I want estimated and actual hours on projects, so that I can compare planned and real work.
27. As a user, I want project custom fields, so that different types of work can store different details.
28. As a user, I want to tag projects, so that I can filter and group them.
29. As a user, I want project timelines, so that all exchanges and tickets are visible in context.
30. As a user, I want files attached to projects, so that contracts, specs, and deliverables are stored centrally.

### Tickets And Issues

31. As a user, I want to create tickets inside projects, so that tasks, bugs, feature requests, and questions are tracked.
32. As a user, I want fixed ticket types, so that issue classification remains simple.
33. As a user, I want fixed ticket statuses, so that work moves through a predictable flow.
34. As a user, I want ticket priorities, so that urgent work is visible.
35. As a user, I want ticket due dates, so that deadlines are tracked.
36. As a user, I want list and kanban ticket views, so that I can work in the view that fits the moment.
37. As a user, I want ticket comments stored as exchanges, so that ticket discussions appear in the unified timeline.
38. As a user, I want to email ticket comments to clients when appropriate, so that support/project communication can happen from DCRM.
39. As a user, I want client replies to ticket emails linked back to the ticket, so that the conversation remains in context.
40. As a user, I want internal ticket notes that are never emailed, so that private working notes stay private.
41. As a user, I want files attached to tickets, so that screenshots and supporting documents are tied to the issue.

### Exchanges

42. As a user, I want a unified exchange timeline per client, project, and ticket, so that I can understand history without searching multiple places.
43. As a user, I want exchange types for email, note, call, meeting, and comment, so that all business interactions are represented.
44. As a user, I want notes to be internal-only, so that private notes cannot be accidentally sent externally.
45. As a user, I want to manually log calls and meetings, so that offline interactions are recorded.
46. As a user, I want existing exchanges imported or synced when integrations provide them, so that historical context is not lost.

### Email

47. As a user, I want to configure IMAP and SMTP, so that DCRM can sync and send email using my mailbox.
48. As a user, I want email credentials encrypted at rest, so that secrets are protected.
49. As a user, I want incoming emails matched to clients by authorized email addresses and wildcard patterns, so that exchanges are linked automatically.
50. As a user, I want unmatched emails collected in an unmatched inbox, so that potential new prospects or unknown senders are not lost.
51. As a user, I want outgoing DCRM emails marked to prevent sync loops, so that sent messages are not imported incorrectly.
52. As a user, I want threaded email views, so that email context is readable.
53. As a user, I want authorized incoming emails to emit events, so that hooks can react to new exchanges.

### Events And Hooks

54. As a user, I want every meaningful action to emit an event, so that the CRM is extensible.
55. As a user, I want events for clients, leads, projects, tickets, exchanges, files, imports, email sync, and webhooks, so that automations can react broadly.
56. As a user, I want to subscribe multiple hooks to an event, so that one action can trigger multiple workflows.
57. As a user, I want hooks on the same event to run independently, so that one failed hook does not block the others.
58. As a user, I want hook execution logs, so that I can see what ran, what succeeded, and what failed.
59. As a user, I want failed hooks to be visible without notification spam, so that I can fix automation issues calmly.
60. As a user, I want hook-driven writes to avoid triggering more hooks by default, so that automation loops are prevented.
61. As a user, I want advanced hook configurations to opt into downstream event emission when explicitly needed, so that controlled chained automations remain possible.

### AI Hooks

62. As a user, I want AI hooks to use natural-language prompts and structured outputs, so that AI results are predictable and mappable.
63. As a user, I want built-in AI hook templates such as summarize, classify, extract contacts, and enrich from web, so that setup is fast.
64. As a user, I want custom AI hooks, so that I can automate workflows specific to my business.
65. As a user, I want each AI hook to choose its AI provider and model, so that I can match cost and quality to the task.
66. As a user, I want each AI hook to choose whether mapped changes are proposed first or written directly, so that I can balance safety and automation.
67. As a user, I want AI results stored as insights even when they do not mutate fields, so that the analysis remains visible.
68. As a user, I want field mapping from structured AI output to CRM fields, so that enrichment can populate useful data.
69. As a user, I want AI hooks to run asynchronously, so that the UI remains responsive.

### AI Providers And Chat

70. As a user, I want to bring my own AI keys, so that I control cost, provider choice, and data exposure.
71. As a user, I want OpenRouter support, so that I can access many models from one provider.
72. As a user, I want OpenAI support with custom base URL compatibility, so that I can use OpenAI-compatible services.
73. As a user, I want Anthropic support with custom base URL compatibility, so that I can use Anthropic-compatible services.
74. As a user, I want Google support, so that I can use Gemini models.
75. As a user, I want AI keys encrypted at rest, so that provider credentials are protected.
76. As a user, I want a multi-turn AI assistant, so that I can ask questions about my CRM data.
77. As a user, I want the AI assistant to use controlled server-side CRM tools, so that AI access is explicit and auditable.
78. As a user, I want the AI assistant to search clients, summarize projects, list open tickets, and analyze pipeline state, so that I can get practical business help.

### Webhooks

79. As a user, I want outgoing webhooks subscribed to events, so that DCRM can notify external tools.
80. As a user, I want outgoing webhook authentication by bearer token, basic auth, HMAC signature, or custom headers, so that I can integrate with many systems.
81. As a user, I want outgoing webhooks to retry on transient failure, so that temporary network issues do not lose events.
82. As a user, I want incoming webhooks with unique URLs and token or secret verification, so that external services can safely send data to DCRM.
83. As a user, I want incoming webhook payload mapping, so that external payloads can be transformed into DCRM event payloads without code.
84. As a user, I want incoming webhooks to create internal DCRM events rather than directly mutating records, so that all automation goes through one event model.
85. As a user, I want new incoming webhook mappings to start in test mode, so that I can preview transformed event payloads before live processing.

### Forms

86. As a user, I want consistent forms across the app, so that create and edit flows are predictable.
87. As a developer, I want all app forms to use Formedible, so that form definitions are schema-driven and aligned with shadcn UI.
88. As a developer, I want custom fields rendered through Formedible, so that dynamic entity metadata does not require bespoke forms.
89. As a developer, I want Better Auth to own login/logout/signup forms, so that auth remains integrated with the auth provider.

### Files

90. As a user, I want to attach files to clients, leads, projects, tickets, and exchanges, so that related documents are stored in context.
91. As a user, I want local file storage by default for self-hosting, so that setup is simple.
92. As a hosted operator, I want S3-compatible storage support, so that file storage can scale.
93. As a user, I want common file previews, so that images and PDFs can be viewed without downloading.
94. As an operator, I want configurable file size and storage quotas, so that storage costs are controlled.

### Search And Filtering

95. As a user, I want global search across clients, leads, projects, tickets, exchanges, and core fields, so that I can find anything quickly.
96. As a user, I want filters by tags, status, date range, and entity type, so that lists remain usable as data grows.
97. As a user, I want simple database-backed search first, so that the system remains easy to maintain before advanced search exists.

### Import And Export

98. As a user, I want to import clients from CSV, so that I can migrate from spreadsheets or other tools.
99. As a user, I want to export lists as CSV or JSON, so that I can use my data elsewhere.
100. As a user, I want a full data export, so that I own my data.

### Notifications

101. As a user, I want in-app notifications for important events, so that I do not miss relevant activity.
102. As a user, I want automation failures to be visible in a hook status area, so that notifications remain focused.

### Internationalization

103. As a user, I want the UI to support multiple languages, so that I can use DCRM in my preferred language.
104. As a developer, I want i18n established from the beginning, so that translations are not bolted on later.

### Mobile

105. As a mobile user, I want to browse clients, projects, tickets, and exchanges, so that I can access CRM context on the go.
106. As a mobile user, I want to create and edit core records, so that I can capture information immediately.
107. As a developer, I want the mobile app to share the same tRPC API, so that behavior stays consistent across clients.
108. As a developer, I want Expo and Uniwind used for the mobile app, so that the existing bootstrapped stack is respected.

### Desktop

109. As a desktop user, I want an Electrobun desktop app, so that DCRM can run in a dedicated desktop window.
110. As a developer, I want the desktop app to remain a thin wrapper around the web app unless native features are explicitly required, so that maintenance stays simple.

### Public API

111. As a user, I want to generate API keys, so that I can integrate scripts and external tools with DCRM.
112. As a user, I want API keys to authenticate tRPC access, so that integrations use the same domain behavior as the app.
113. As a user, I want API keys hashed at rest and shown only once, so that leaked database contents do not reveal raw keys.

### Billing And Hosted Service

114. As a hosted user, I want to subscribe yearly for $24/year, so that I can use the hosted service without self-hosting.
115. As a hosted user, I want to manage subscription status, so that I can see whether my account is active.
116. As an operator, I want billing to be optional and env-gated, so that self-hosted deployments can run without Stripe.
117. As an operator, I want Dokploy and docker-compose deployment, so that hosted operations match the chosen infrastructure.

### Open Source

118. As a user, I want DCRM to be open source, so that I can inspect, self-host, and modify the software.
119. As a contributor, I want a permissive license posture, so that adoption and contribution remain straightforward.
120. As an operator, I want the hosted service to be a paid convenience offering, so that the open-source project and hosted business can coexist.

## Implementation Decisions

### Core Product Shape

DCRM is a single-user CRM. There are no organizations, teams, shared workspaces, role-based collaboration features, invitations, or multi-member permissions. Hosted multi-tenancy exists only at the infrastructure/data-isolation level: many users can exist in the same hosted database, but each user's data is scoped directly by `userId`.

The product centers on these domain entities:

| Entity | Purpose |
|---|---|
| Client | Active customer/contact profile |
| Lead | Prospect before conversion to client |
| Project | Work container tied to a client |
| Ticket | Task, issue, bug, feature, or question inside a project |
| Exchange | Email, note, call, meeting, or ticket comment |
| Attachment | File linked to an entity |
| Tag | User-defined categorization |
| Event | Normalized record of a meaningful action |
| Hook | Automation subscribed to events |

### Existing Monorepo Context

The repository is already bootstrapped with apps for web, native, and desktop, plus packages for API, auth, database, environment, UI, and shared config. The PRD assumes those foundations remain and new deep modules are added only where they encapsulate meaningful complexity.

The current package responsibilities should evolve as follows:

| Module | Responsibility |
|---|---|
| Database module | Drizzle schema, migrations, database connection, typed schema exports |
| API module | tRPC routers, protected procedures, API-key-aware auth middleware |
| Auth module | Better Auth configuration, session handling, API key generation and verification |
| UI module | shadcn components, Tailwind tokens, Formedible integration primitives |
| Event engine module | Event definitions, event emission, hook subscription resolution, execution records |
| AI module | TanStack AI adapters, prompt execution, structured output, AI CRM tools |
| Email module | IMAP sync, SMTP send, matching, threading, loop prevention |
| Storage module | Local and S3-compatible attachment storage |
| Crypto module | AES-256-GCM encryption/decryption for secrets |
| Billing module | Stripe subscription and webhook handling, enabled by environment |
| i18n module | Locale definitions, translation loading, user locale integration |

### Database Decisions

All user-owned records include `userId`, `createdAt`, `updatedAt`, and where appropriate `deletedAt`. Default reads exclude soft-deleted records. A trash/restore flow is provided for soft-deleted core entities.

IDs should be text identifiers generated by the application, such as cuid2 or nanoid. PostgreSQL is the primary database target. JSONB is acceptable for flexible metadata such as custom fields, social links, addresses, event payloads, hook config, and mapping config.

Custom fields are stored as schema/config plus per-entity values. Supported field types are text, number, date, select, checkbox, textarea, and URL.

Currency is stored per monetary field as amount plus currency text. No exchange rates, conversion, multi-currency reporting, or financial arithmetic across currencies are required.

### Event Engine

Every meaningful write action emits a typed event. Events are normalized and user-scoped.

The event shape is conceptually:

```ts
type DcrmEvent = {
  id: string
  type: string
  userId: string
  source: "app" | "email" | "webhook" | "api" | "hook" | "system"
  entity?: {
    type: string
    id: string
  }
  payload: Record<string, unknown>
  changes?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  }
  createdAt: Date
}
```

Core lifecycle events include create, update, delete, status change, stage change, received exchange, file attached, import completed, and webhook received variants.

Hooks subscribe to specific event types. Multiple hooks can subscribe to the same event. Hook execution is asynchronous through BullMQ and Redis. Hook executions are recorded with status, input, output, error, timestamps, and retry metadata.

Hooks on the same event use fire-all behavior. They run independently. One hook failure does not stop other hooks subscribed to the same event.

Hook-driven writes do not trigger downstream hook automation by default. This prevents accidental loops. The system records provenance for hook-driven writes. A later advanced setting may allow a hook to explicitly emit downstream events, but the default is suppression.

### Hook Types

Supported hook types are AI hooks, outgoing webhooks, and built-in hooks. The event engine should be designed so additional hook types can be added without rewriting event emission.

AI hooks contain provider/model selection, prompt configuration, structured output schema, field mapping, and write behavior. The write behavior is configured per hook. A hook can either propose mapped changes for user approval or directly apply validated mapped changes.

Outgoing webhook hooks contain target URL, authentication config, headers, retry policy, and payload template/config. Supported outgoing authentication includes bearer token, basic auth, HMAC signature, and custom headers.

Built-in hooks are first-party actions maintained by DCRM, such as creating a notification, applying a tag, running a known enrichment template, or creating a follow-up ticket.

### Incoming Webhooks

Incoming webhooks are external inputs that create internal DCRM events. They do not directly create or update CRM records. This keeps all automation flowing through one event model.

Each incoming webhook has a unique generated URL, token or secret verification, enabled/test state, and payload mapping configuration.

New incoming webhook mappings start in test mode. In test mode, the user can paste or receive sample payloads, preview the mapped internal event payload, and validate the transformation before live event emission is enabled.

The payload mapping UI should support JSON path style source selection and mapping to target event payload fields. The saved mapping is JSON so it can be exported, imported, and versioned.

### AI Integration - TanStack AI Only

The AI system uses TanStack AI exclusively.

The Vercel AI SDK is not part of this architecture. The Vercel AI SDK `ai` package must not be added as a dependency. AI examples or implementation patterns should be based on TanStack AI, not the Vercel AI SDK.

The AI package provides a provider abstraction over TanStack AI for:

| Provider | Requirement |
|---|---|
| OpenRouter | First-party adapter |
| OpenAI | First-party adapter plus custom base URL for compatible APIs |
| Anthropic | First-party adapter plus custom base URL for compatible APIs |
| Google | First-party adapter |

All AI providers are BYOK only. DCRM does not provide bundled first-party AI credits as part of the $24/year hosted plan.

AI keys are encrypted at rest using the shared crypto module and decrypted only when needed for execution. Secrets are never logged or returned through API responses.

AI hook outputs use structured validation before mapping. Zod is the canonical schema tool for validation in the TypeScript codebase. AI outputs can be stored as insights even when not applied to entity fields.

The AI chat assistant uses server-side CRM tools, not direct tRPC procedure calls exposed to the model. Tools should be narrow, explicit, and auditable, such as search clients, summarize project, list open tickets, pipeline summary, and get recent exchanges.

### Forms - Formedible

All application create/edit/configuration forms use Formedible from formedible.dev. This includes CRM entity forms, custom field forms, settings forms, hook configuration forms, webhook mapping forms, email configuration forms, AI provider forms, and import forms.

The only exception is authentication UI owned by Better Auth, including login, logout, signup, password reset, and auth-related account flows.

Formedible is required because DCRM relies on schema-driven forms, dynamic custom fields, consistent shadcn rendering, and future AI-assisted prefill behavior.

### Email Integration

Email integration supports IMAP sync and SMTP sending. Credentials are encrypted at rest. Sync jobs run through BullMQ.

Incoming email matching uses authorized addresses and wildcard patterns per client. Matched messages are stored as exchanges and can emit events. Unmatched messages are stored in an unmatched inbox for manual linking.

Outgoing email generated by DCRM includes a loop-prevention marker header such as `X-DCRM-Sent: true`. IMAP sync ignores messages with this marker.

Ticket comments can be sent by email. Replies are matched back to the ticket using email threading headers such as `In-Reply-To` and `References` when available.

### API And Public Integrations

tRPC is the application API. Protected procedures accept either a valid Better Auth session or a valid API key where public integration access is intended.

API keys are generated by the user, named, shown once, hashed at rest, and tracked with creation and last-used timestamps. Full-access API keys are acceptable unless a later requirement introduces scopes.

External integrations should generally prefer events and webhooks for automation, and API keys for direct programmatic CRUD.

### Attachments And Storage

Attachments can be linked to clients, leads, projects, tickets, and exchanges. Metadata is stored in the database. Binary storage uses local filesystem by default and S3-compatible storage when configured.

Storage backend selection is environment-driven. Self-hosted deployments should work without S3. Hosted deployments can use S3-compatible storage.

File size limits and user quotas are environment-configurable. The PRD does not require unlimited hosted storage.

### Billing

The hosted DCRM service is priced at $24/year. Billing is implemented with Stripe for the hosted deployment. Subscription status gates access only when billing is enabled.

Billing is environment-gated. Self-hosted deployments run without billing unless the operator explicitly configures billing environment variables.

### Deployment

Hosted deployment uses Dokploy with docker-compose. The deployment includes the web app, PostgreSQL, Redis, and any configured storage/billing integrations.

Self-hosted deployment uses docker-compose and environment variables. Required services are PostgreSQL and Redis. Redis is required because BullMQ powers hooks, email sync, and background work.

### Open Source And License

DCRM is open source and self-hostable. The license posture is permissive. The exact permissive license can be selected separately, but the PRD intent is MIT/Apache-style rather than copyleft or open-core.

The hosted service is a paid convenience offering on top of the open-source project. The PRD does not require hiding core CRM, AI BYOK, webhook, or self-hosting features behind a closed-source edition.

### Security

All user data access is scoped by `userId`. No route, procedure, job, hook, webhook, or AI tool may access data outside the authenticated user context.

Secrets such as AI keys, IMAP passwords, SMTP passwords, webhook secrets, and encrypted auth material are encrypted at rest using AES-256-GCM or an equivalent authenticated encryption mechanism.

Webhook secrets and API keys are not stored in plaintext. Raw API keys are shown only once.

AI tool execution must be server-side and constrained to explicit CRM tools. AI prompts must not receive raw secrets. Hook logs must avoid storing decrypted credentials.

Incoming webhook test mode is the safe default to reduce accidental data mutation or noisy automations.

### Deep Modules

The following deep modules should encapsulate complexity behind stable interfaces:

| Deep module | Why it should be deep |
|---|---|
| Event engine | Centralizes event emission, hook selection, loop prevention, execution logs, retries |
| AI execution | Centralizes TanStack AI provider adapters, structured outputs, CRM tools, encryption boundaries |
| Email sync | Encapsulates IMAP/SMTP, matching, threading, loop prevention, sync state |
| Webhook mapping | Encapsulates JSON path extraction, validation, test/live behavior, event creation |
| Crypto | Encapsulates secret encryption/decryption and key handling |
| Storage | Encapsulates local/S3 differences behind one attachment API |
| Billing | Encapsulates Stripe subscription state and env-gated middleware |
| Form schema layer | Encapsulates Formedible schema generation for static and custom-field forms |

## Testing Decisions

Tests should verify external behavior rather than implementation details. A good test proves that the observable domain behavior works through public module interfaces or API calls.

The database layer should be tested against PostgreSQL where PostgreSQL-specific behavior matters, especially JSONB, migrations, constraints, and indexes.

The API should be tested through tRPC callers using authenticated context and API-key context. Tests should verify user scoping and prevent cross-user access.

The event engine should have tests for event emission, hook subscription matching, fire-all execution, execution status records, retries, and default loop suppression for hook-driven writes.

AI execution should be tested with mocked TanStack AI providers. Tests should verify provider selection, encrypted key retrieval boundaries, structured output validation, field mapping, insight storage, propose-first behavior, and direct-write behavior.

The codebase must not use the Vercel AI SDK. This PRD records that as an architecture rule. The user selected a PRD warning rather than a required CI guardrail.

Webhook mapping should be tested for JSON path extraction, transformation previews, test-mode behavior, secret verification, and conversion into internal events.

Email integration should be tested for authorized sender matching, wildcard matching, unmatched inbox behavior, ticket reply threading, and loop-prevention header handling.

Crypto should be tested with encrypt/decrypt round trips, authentication failure on tampering, and no plaintext secret leakage through returned API objects.

Storage should be tested through a backend-agnostic attachment interface, with local storage covered first and S3-compatible behavior tested through mocks or test containers.

Form behavior should be tested at the schema/rendering boundary where practical. Tests should verify that entity forms and dynamic custom fields are represented through Formedible schemas, not bespoke form implementations.

Billing should be tested for env-gated behavior, Stripe webhook handling, subscription status updates, and access checks when billing is enabled.

## Out Of Scope

Team accounts, organizations, shared workspaces, invitations, roles, and collaboration are out of scope.

Vercel AI SDK usage is out of scope. The project uses TanStack AI only.

Bundled AI credits are out of scope. AI is BYOK only.

Complex enterprise CRM features are out of scope, including sales teams, territories, account ownership, approval chains, and multi-user pipelines.

Advanced accounting and invoicing are out of scope. DCRM may track project budgets, estimates, and currencies, but it does not replace invoicing software.

Currency conversion and exchange-rate handling are out of scope.

Full-text search, semantic search, and vector search are out of scope unless later added as explicit enhancements. Simple database search is sufficient initially.

Realtime multi-user collaboration is out of scope.

Desktop-native features beyond the Electrobun wrapper are out of scope unless separately specified.

Mobile feature parity with the web app is out of scope. Mobile should focus on core CRM access and simple edits.

Webhook direct mutation mode is out of scope. Incoming webhooks create internal events.

Immediate live processing for new incoming webhook mappings is out of scope. New mappings start in test mode.

Automatic downstream hook chains are out of scope by default. Hook-driven writes suppress downstream automation unless explicitly configured later.

## Further Notes

This document is revision v3 of the PRD. The `v3` name refers to the PRD document revision, not a product release version.

The strongest architectural constraints are single-user scope, event-driven extensibility, Formedible for forms, BYOK AI, and TanStack AI only.

Repeat requirement: AI integration uses TanStack AI. It does not use the Vercel AI SDK. Do not add the `ai` package from Vercel AI SDK. Do not implement AI features with Vercel AI SDK APIs.

Repeat requirement: all forms except Better Auth authentication forms use Formedible from formedible.dev.

Repeat requirement: this is not a team CRM. There are no organizations, no team members, no collaboration, and no shared workspaces.

The implementation should prefer small, clean modules with stable boundaries. The goal is an extensible product without accidental framework sprawl or enterprise CRM complexity.
