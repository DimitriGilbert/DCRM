import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTableColumns, getTableName } from "drizzle-orm";

import {
  aiInsights,
  aiMessages,
  aiProviderTypeEnum,
  aiProviders,
  apiKeys,
  automationIntegrationTableNames,
  automationIntegrationTables,
  billingSubscriptions,
  downstreamEventBehaviorEnum,
  emailAccounts,
  emailSyncStates,
  events,
  eventSourceEnum,
  hookExecutionStatusEnum,
  hookExecutions,
  hooks,
  hookTypeEnum,
  incomingWebhooks,
  unmatchedEmailMessages,
  webhookModeEnum,
} from "./schema/index.js";

describe("automation and integration schema public exports", () => {
  it("exposes user-scoped automation tables with secret-safe credential columns", () => {
    assert.equal(getTableName(events), "events");
    assert.equal(getTableName(hooks), "hooks");
    assert.equal(getTableName(hookExecutions), "hook_executions");
    assert.equal(getTableName(incomingWebhooks), "incoming_webhooks");
    assert.equal(getTableName(aiProviders), "ai_providers");
    assert.equal(getTableName(aiInsights), "ai_insights");
    assert.equal(getTableName(aiMessages), "ai_messages");
    assert.equal(getTableName(emailAccounts), "email_accounts");
    assert.equal(getTableName(emailSyncStates), "email_sync_states");
    assert.equal(getTableName(unmatchedEmailMessages), "unmatched_email_messages");
    assert.equal(getTableName(apiKeys), "api_keys");
    assert.equal(getTableName(billingSubscriptions), "billing_subscriptions");

    const hookColumns = getTableColumns(hooks);
    const webhookColumns = getTableColumns(incomingWebhooks);
    const aiProviderColumns = getTableColumns(aiProviders);
    const emailAccountColumns = getTableColumns(emailAccounts);
    const apiKeyColumns = getTableColumns(apiKeys);

    assert.ok(hookColumns.userId);
    assert.ok(hookColumns.outputSchema);
    assert.ok(hookColumns.fieldMapping);
    assert.ok(hookColumns.downstreamEventBehavior);
    assert.ok(webhookColumns.mappingConfig);
    assert.ok(webhookColumns.mode);
    assert.ok(aiProviderColumns.encryptedApiKey);
    assert.ok(emailAccountColumns.encryptedImapPassword);
    assert.ok(emailAccountColumns.encryptedSmtpPassword);
    assert.ok(apiKeyColumns.keyHash);
    assert.equal("rawKey" in apiKeyColumns, false);
  });

  it("exposes domain-backed enums and a complete automation table registry", () => {
    assert.deepEqual(eventSourceEnum.enumValues, ["app", "email", "webhook", "api", "hook", "system"]);
    assert.deepEqual(hookTypeEnum.enumValues, ["ai", "outgoing_webhook", "built_in"]);
    assert.deepEqual(hookExecutionStatusEnum.enumValues, ["pending", "running", "success", "failed"]);
    assert.deepEqual(downstreamEventBehaviorEnum.enumValues, ["suppress", "emit"]);
    assert.deepEqual(webhookModeEnum.enumValues, ["test", "live"]);
    assert.deepEqual(aiProviderTypeEnum.enumValues, ["openrouter", "openai", "anthropic", "google"]);
    assert.deepEqual(
      automationIntegrationTables.map((table) => getTableName(table)),
      automationIntegrationTableNames,
    );
    assert.deepEqual(
      automationIntegrationTableNames,
      [
        "event_definitions",
        "events",
        "hooks",
        "hook_executions",
        "incoming_webhooks",
        "ai_providers",
        "ai_insights",
        "ai_messages",
        "email_accounts",
        "email_sync_states",
        "unmatched_email_messages",
        "api_keys",
        "billing_subscriptions",
      ],
    );
  });
});
