/**
 * Fixed DCRM application stages for the simple PRD-required lead pipeline.
 *
 * The PRD requires fixed stages and a won-lead conversion path but does not
 * enumerate labels. These constants are the domain contract chosen for DCRM,
 * not a quotation of PRD text.
 */
export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

/** A fixed lead pipeline stage. */
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Domain records are scoped directly to a single authenticated user. */
export const DATA_SCOPE = "user" as const;

/** Core CRM entity types shared by API, database, clients, and workers. */
export const CRM_ENTITY_TYPES = [
  "client",
  "lead",
  "project",
  "ticket",
  "exchange",
  "attachment",
  "tag",
  "event",
  "hook",
] as const;

/** A shared core CRM entity type. */
export type CrmEntityType = (typeof CRM_ENTITY_TYPES)[number];

/** User-defined custom field value kinds supported by DCRM. */
export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "textarea", "url"] as const;

/** A supported custom field value kind. */
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Client record visibility states derived from the PRD soft-delete/restore flow. */
export const CLIENT_DELETION_STATES = ["active", "deleted"] as const;

/** A client record visibility state. */
export type ClientDeletionState = (typeof CLIENT_DELETION_STATES)[number];

/** Lead conversion outcomes. */
export const LEAD_OUTCOMES = ["open", "won", "lost"] as const;

/** A lead conversion outcome. */
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];

/** Fixed project statuses from the PRD. */
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;

/** A fixed project status. */
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Fixed ticket types from the PRD. */
export const TICKET_TYPES = ["task", "issue", "bug", "feature", "question"] as const;

/** A fixed ticket type. */
export type TicketType = (typeof TICKET_TYPES)[number];

/**
 * Fixed DCRM application statuses for tickets.
 *
 * The PRD requires fixed ticket status values but does not enumerate the full
 * label set. These values are the domain contract chosen for DCRM, not a
 * quotation of PRD text.
 */
export const TICKET_STATUSES = ["open", "closed"] as const;

/** A fixed ticket status. */
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Fixed DCRM application priority values for tickets.
 *
 * The PRD requires fixed ticket priority values but does not enumerate the full
 * label set. These values are the domain contract chosen for DCRM, not a
 * quotation of PRD text.
 */
export const TICKET_PRIORITIES = ["normal", "urgent"] as const;

/** A fixed ticket priority. */
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Exchange types from the unified timeline model. */
export const EXCHANGE_TYPES = ["email", "note", "call", "meeting", "comment"] as const;

/** A unified timeline exchange type. */
export type ExchangeType = (typeof EXCHANGE_TYPES)[number];

/** Visibility modes that protect internal notes from external delivery. */
export const EXCHANGE_VISIBILITIES = ["internal", "external"] as const;

/** An exchange visibility mode. */
export type ExchangeVisibility = (typeof EXCHANGE_VISIBILITIES)[number];

/** Entity types that can receive file attachments. */
export const ATTACHMENT_TARGET_TYPES = ["client", "lead", "project", "ticket", "exchange"] as const;

/** A type of entity that can receive file attachments. */
export type AttachmentTargetType = (typeof ATTACHMENT_TARGET_TYPES)[number];

/** Supported attachment storage backends. */
export const ATTACHMENT_STORAGE_BACKENDS = ["local", "s3_compatible"] as const;

/** A supported attachment storage backend. */
export type AttachmentStorageBackend = (typeof ATTACHMENT_STORAGE_BACKENDS)[number];

/** Normalized event sources from the PRD event shape. */
export const EVENT_SOURCES = ["app", "email", "webhook", "api", "hook", "system"] as const;

/** A normalized event source. */
export type EventSource = (typeof EVENT_SOURCES)[number];

/** Core event action names used to form typed event identifiers. */
export const EVENT_ACTIONS = [
  "created",
  "updated",
  "deleted",
  "restored",
  "status_changed",
  "stage_changed",
  "converted",
  "exchange_received",
  "file_attached",
  "import_completed",
  "import_failed",
  "webhook_received",
] as const;

/** A core event action name. */
export type EventAction = (typeof EVENT_ACTIONS)[number];

/** High-level hook types supported by the automation system. */
export const HOOK_TYPES = ["ai", "outgoing_webhook", "built_in"] as const;

/** A supported hook type. */
export type HookType = (typeof HOOK_TYPES)[number];

/** Hook execution lifecycle states. */
export const HOOK_EXECUTION_STATUSES = ["pending", "running", "success", "failed"] as const;

/** A hook execution lifecycle state. */
export type HookExecutionStatus = (typeof HOOK_EXECUTION_STATUSES)[number];

/** Hook write modes from the AI hook safety model. */
export const HOOK_WRITE_BEHAVIORS = ["propose", "direct"] as const;

/** A hook write mode. */
export type HookWriteBehavior = (typeof HOOK_WRITE_BEHAVIORS)[number];

/** Downstream automation behavior for hook-driven writes. */
export const DOWNSTREAM_EVENT_BEHAVIORS = ["suppress", "emit"] as const;

/** A downstream automation behavior. */
export type DownstreamEventBehavior = (typeof DOWNSTREAM_EVENT_BEHAVIORS)[number];

/** BYOK AI providers supported through TanStack AI only. */
export const AI_PROVIDER_TYPES = ["openrouter", "openai", "anthropic", "google"] as const;

/** A BYOK AI provider supported through TanStack AI only. */
export type AiProviderType = (typeof AI_PROVIDER_TYPES)[number];

/** Built-in AI hook templates. */
export const AI_HOOK_TEMPLATES = ["summarize", "classify", "extract_contacts", "enrich_from_web"] as const;

/** A built-in AI hook template. */
export type AiHookTemplate = (typeof AI_HOOK_TEMPLATES)[number];

/** Incoming webhook processing modes. */
export const WEBHOOK_MODES = ["test", "live"] as const;

/** An incoming webhook processing mode. */
export type WebhookMode = (typeof WEBHOOK_MODES)[number];

/** Supported outgoing webhook authentication types. */
export const WEBHOOK_AUTH_TYPES = ["none", "bearer", "basic", "hmac", "custom_headers"] as const;

/** A supported outgoing webhook authentication type. */
export type WebhookAuthType = (typeof WEBHOOK_AUTH_TYPES)[number];

/** Outgoing webhook delivery states. */
export const WEBHOOK_DELIVERY_STATUSES = ["pending", "delivered", "failed", "retrying"] as const;

/** An outgoing webhook delivery state. */
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/** Billing modes for hosted and self-hosted deployments. */
export const BILLING_MODES = ["disabled", "stripe"] as const;

/** A billing mode. */
export type BillingMode = (typeof BILLING_MODES)[number];

/** Hosted access states exposed at the domain boundary; Stripe internals stay in billing code. */
export const SUBSCRIPTION_STATUSES = ["inactive", "active"] as const;

/** A hosted subscription state. */
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Hosted DCRM yearly price in USD cents. */
export const HOSTED_YEARLY_PRICE_USD_CENTS = 2_400 as const;

/** Supported user theme preferences. */
export const USER_THEME_PREFERENCES = ["light", "dark", "system"] as const;

/** A supported user theme preference. */
export type UserThemePreference = (typeof USER_THEME_PREFERENCES)[number];

/** Supported onboarding steps. */
export const ONBOARDING_STEPS = ["language", "ai_provider", "email", "done"] as const;

/** A supported onboarding step. */
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Default locale used before i18n expansion. */
export const DEFAULT_LOCALE = "en" as const;

/** Phase 1A domain constants grouped by product concept for cross-package consumers. */
export const DOMAIN_CONSTANT_GROUPS = {
  client: {
    deletionStates: CLIENT_DELETION_STATES,
  },
  lead: {
    stages: LEAD_STAGES,
    outcomes: LEAD_OUTCOMES,
  },
  project: {
    statuses: PROJECT_STATUSES,
  },
  ticket: {
    types: TICKET_TYPES,
    statuses: TICKET_STATUSES,
    priorities: TICKET_PRIORITIES,
  },
  exchange: {
    types: EXCHANGE_TYPES,
    visibilities: EXCHANGE_VISIBILITIES,
  },
  attachment: {
    targetTypes: ATTACHMENT_TARGET_TYPES,
    storageBackends: ATTACHMENT_STORAGE_BACKENDS,
  },
  event: {
    sources: EVENT_SOURCES,
    actions: EVENT_ACTIONS,
  },
  hook: {
    types: HOOK_TYPES,
    executionStatuses: HOOK_EXECUTION_STATUSES,
    writeBehaviors: HOOK_WRITE_BEHAVIORS,
    downstreamEventBehaviors: DOWNSTREAM_EVENT_BEHAVIORS,
  },
  aiProvider: {
    types: AI_PROVIDER_TYPES,
    hookTemplates: AI_HOOK_TEMPLATES,
  },
  webhook: {
    modes: WEBHOOK_MODES,
    authTypes: WEBHOOK_AUTH_TYPES,
    deliveryStatuses: WEBHOOK_DELIVERY_STATUSES,
  },
  billing: {
    modes: BILLING_MODES,
    subscriptionStatuses: SUBSCRIPTION_STATUSES,
    hostedYearlyPriceUsdCents: HOSTED_YEARLY_PRICE_USD_CENTS,
  },
  userSettings: {
    themePreferences: USER_THEME_PREFERENCES,
    onboardingSteps: ONBOARDING_STEPS,
    defaultLocale: DEFAULT_LOCALE,
  },
} as const;

/**
 * Checks whether an unknown value is one of the values in a readonly domain constant tuple.
 */
export function isDomainValue<const TValues extends readonly string[]>(
  values: TValues,
  value: unknown,
): value is TValues[number] {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}
