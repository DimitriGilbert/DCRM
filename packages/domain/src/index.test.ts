import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_HOOK_TEMPLATES,
  AI_PROVIDER_TYPES,
  ATTACHMENT_STORAGE_BACKENDS,
  ATTACHMENT_TARGET_TYPES,
  BILLING_MODES,
  CLIENT_DELETION_STATES,
  DEFAULT_LOCALE,
  DOMAIN_CONSTANT_GROUPS,
  DOWNSTREAM_EVENT_BEHAVIORS,
  EVENT_ACTIONS,
  EVENT_SOURCES,
  EXCHANGE_TYPES,
  EXCHANGE_VISIBILITIES,
  HOOK_EXECUTION_STATUSES,
  HOOK_TYPES,
  HOOK_WRITE_BEHAVIORS,
  LEAD_STAGES,
  ONBOARDING_STEPS,
  PROJECT_STATUSES,
  SUBSCRIPTION_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  USER_THEME_PREFERENCES,
  WEBHOOK_AUTH_TYPES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_MODES,
  isDomainValue,
} from "./index.js";

describe("domain constants", () => {
  it("exposes DCRM fixed lead pipeline stages for the PRD-required simple pipeline", () => {
    assert.deepEqual(LEAD_STAGES, ["new", "contacted", "qualified", "proposal", "won", "lost"]);
    assert.equal(isDomainValue(LEAD_STAGES, "qualified"), true);
    assert.equal(isDomainValue(LEAD_STAGES, "workspace_review"), false);
  });

  it("keeps lifecycle statuses out of clients and models only soft-delete visibility", () => {
    assert.deepEqual(CLIENT_DELETION_STATES, ["active", "deleted"]);
    assert.equal(isDomainValue(CLIENT_DELETION_STATES, "archived"), false);
    assert.equal(isDomainValue(CLIENT_DELETION_STATES, "inactive"), false);
  });

  it("keeps ticket workflow and priority constants to PRD-supported fixed sets", () => {
    assert.deepEqual(TICKET_STATUSES, ["open", "closed"]);
    assert.deepEqual(TICKET_PRIORITIES, ["normal", "urgent"]);
    assert.equal(isDomainValue(TICKET_STATUSES, "waiting"), false);
    assert.equal(isDomainValue(TICKET_PRIORITIES, "low"), false);
  });

  it("exposes observable project, ticket, exchange, attachment, event, and hook values", () => {
    assert.deepEqual(PROJECT_STATUSES, ["planning", "active", "on_hold", "completed", "archived"]);
    assert.deepEqual(TICKET_TYPES, ["task", "issue", "bug", "feature", "question"]);
    assert.deepEqual(EXCHANGE_TYPES, ["email", "note", "call", "meeting", "comment"]);
    assert.deepEqual(EXCHANGE_VISIBILITIES, ["internal", "external"]);
    assert.deepEqual(ATTACHMENT_TARGET_TYPES, ["client", "lead", "project", "ticket", "exchange"]);
    assert.deepEqual(ATTACHMENT_STORAGE_BACKENDS, ["local", "s3_compatible"]);
    assert.deepEqual(EVENT_SOURCES, ["app", "email", "webhook", "api", "hook", "system"]);
    assert.deepEqual(EVENT_ACTIONS, [
      "created",
      "updated",
      "deleted",
      "restored",
      "status_changed",
      "stage_changed",
      "exchange_received",
      "file_attached",
      "import_completed",
      "webhook_received",
    ]);
    assert.deepEqual(HOOK_TYPES, ["ai", "outgoing_webhook", "built_in"]);
    assert.deepEqual(HOOK_EXECUTION_STATUSES, ["pending", "running", "success", "failed"]);
    assert.deepEqual(HOOK_WRITE_BEHAVIORS, ["propose", "direct"]);
    assert.deepEqual(DOWNSTREAM_EVENT_BEHAVIORS, ["suppress", "emit"]);
  });

  it("exposes observable AI template and user-setting defaults", () => {
    assert.deepEqual(AI_HOOK_TEMPLATES, ["summarize", "classify", "extract_contacts", "enrich_from_web"]);
    assert.deepEqual(ONBOARDING_STEPS, ["language", "ai_provider", "email", "done"]);
    assert.equal(DEFAULT_LOCALE, "en");
  });

  it("exposes hosted billing access states without Stripe subscription internals", () => {
    assert.deepEqual(SUBSCRIPTION_STATUSES, ["inactive", "active"]);
    assert.equal(isDomainValue(SUBSCRIPTION_STATUSES, "past_due"), false);
    assert.equal(isDomainValue(SUBSCRIPTION_STATUSES, "incomplete"), false);
  });

  it("exposes BYOK TanStack AI providers and webhook modes without direct mutation mode", () => {
    assert.deepEqual(AI_PROVIDER_TYPES, ["openrouter", "openai", "anthropic", "google"]);
    assert.deepEqual(WEBHOOK_MODES, ["test", "live"]);
    assert.deepEqual(WEBHOOK_AUTH_TYPES, ["none", "bearer", "basic", "hmac", "custom_headers"]);
    assert.deepEqual(WEBHOOK_DELIVERY_STATUSES, ["pending", "delivered", "failed", "retrying"]);
    assert.equal(isDomainValue(WEBHOOK_MODES, "direct_mutation"), false);
  });

  it("groups Phase 1A concept constants for app and worker consumers", () => {
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.client.deletionStates, CLIENT_DELETION_STATES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.lead.stages, LEAD_STAGES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.project.statuses, PROJECT_STATUSES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.ticket.types, TICKET_TYPES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.ticket.statuses, TICKET_STATUSES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.exchange.types, EXCHANGE_TYPES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.attachment.targetTypes, ATTACHMENT_TARGET_TYPES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.event.sources, EVENT_SOURCES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.hook.types, HOOK_TYPES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.aiProvider.types, AI_PROVIDER_TYPES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.webhook.modes, WEBHOOK_MODES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.billing.modes, BILLING_MODES);
    assert.deepEqual(DOMAIN_CONSTANT_GROUPS.userSettings.themePreferences, USER_THEME_PREFERENCES);
  });
});
