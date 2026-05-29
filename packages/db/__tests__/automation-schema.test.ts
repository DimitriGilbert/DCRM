import { describe, it, expect } from "vitest";

import {
  events,
  eventsRelations,
  eventSourceEnum,
  hooks,
  hooksRelations,
  hookTypeEnum,
  hookWriteBehaviorEnum,
  hookExecutions,
  hookExecutionsRelations,
  hookExecutionStatusEnum,
  incomingWebhooks,
  incomingWebhooksRelations,
  incomingWebhookModeEnum,
  aiProviders,
  aiProvidersRelations,
  aiProviderEnum,
  aiInsights,
  aiInsightsRelations,
  aiChatMessages,
  aiChatMessagesRelations,
  emailAccounts,
  emailAccountsRelations,
  emailSyncState,
  emailSyncStateRelations,
  unmatchedEmails,
  unmatchedEmailsRelations,
  apiKeys,
  apiKeysRelations,
  subscriptions,
  subscriptionsRelations,
  billingStatusEnum,
  notifications,
  notificationsRelations,
} from "../src/schema/automation";

import {
  EVENT_SOURCE_VALUES,
  HOOK_TYPE_VALUES,
  HOOK_WRITE_BEHAVIOR_VALUES,
  HOOK_EXECUTION_STATUS_VALUES,
  INCOMING_WEBHOOK_MODE_VALUES,
  AI_PROVIDER_VALUES,
  BILLING_STATUS_VALUES,
} from "@DCRM/domain";

function getColumnNames(table: object): Set<string> {
  return new Set(
    Object.keys(table).filter((k) => {
      const val = (table as Record<string, unknown>)[k];
      return typeof val === "object" && val !== null && "dataType" in val;
    }),
  );
}

// --- Enum tests ---

describe("automation enums match domain constants", () => {
  it("eventSourceEnum values match EVENT_SOURCES from domain", () => {
    expect(eventSourceEnum.enumValues).toEqual([...EVENT_SOURCE_VALUES]);
  });

  it("hookTypeEnum values match HOOK_TYPES from domain", () => {
    expect(hookTypeEnum.enumValues).toEqual([...HOOK_TYPE_VALUES]);
  });

  it("hookWriteBehaviorEnum values match HOOK_WRITE_BEHAVIORS from domain", () => {
    expect(hookWriteBehaviorEnum.enumValues).toEqual([...HOOK_WRITE_BEHAVIOR_VALUES]);
  });

  it("hookExecutionStatusEnum values match HOOK_EXECUTION_STATUSES from domain", () => {
    expect(hookExecutionStatusEnum.enumValues).toEqual([...HOOK_EXECUTION_STATUS_VALUES]);
  });

  it("incomingWebhookModeEnum values match INCOMING_WEBHOOK_MODES from domain", () => {
    expect(incomingWebhookModeEnum.enumValues).toEqual([...INCOMING_WEBHOOK_MODE_VALUES]);
  });

  it("aiProviderEnum values match AI_PROVIDERS from domain", () => {
    expect(aiProviderEnum.enumValues).toEqual([...AI_PROVIDER_VALUES]);
  });

  it("billingStatusEnum values match BILLING_STATUSES from domain", () => {
    expect(billingStatusEnum.enumValues).toEqual([...BILLING_STATUS_VALUES]);
  });
});

// --- Table column tests ---

describe("events table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(events);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("type");
    expect(cols).toContain("source");
    expect(cols).toContain("entityType");
    expect(cols).toContain("entityId");
    expect(cols).toContain("payload");
    expect(cols).toContain("changes");
    expect(cols).toContain("createdAt");
  });
});

describe("hooks table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(hooks);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("type");
    expect(cols).toContain("eventType");
    expect(cols).toContain("enabled");
    expect(cols).toContain("config");
    expect(cols).toContain("outputSchema");
    expect(cols).toContain("fieldMapping");
    expect(cols).toContain("writeBehavior");
    expect(cols).toContain("emitDownstreamEvents");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("hookExecutions table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(hookExecutions);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("hookId");
    expect(cols).toContain("eventId");
    expect(cols).toContain("status");
    expect(cols).toContain("input");
    expect(cols).toContain("output");
    expect(cols).toContain("error");
    expect(cols).toContain("startedAt");
    expect(cols).toContain("completedAt");
    expect(cols).toContain("retryCount");
    expect(cols).toContain("maxRetries");
    expect(cols).toContain("createdAt");
  });
});

describe("incomingWebhooks table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(incomingWebhooks);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("urlToken");
    expect(cols).toContain("secret");
    expect(cols).toContain("mode");
    expect(cols).toContain("mappingConfig");
    expect(cols).toContain("enabled");
    expect(cols).toContain("lastReceivedAt");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("aiProviders table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(aiProviders);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("provider");
    expect(cols).toContain("name");
    expect(cols).toContain("encryptedApiKey");
    expect(cols).toContain("baseUrl");
    expect(cols).toContain("config");
    expect(cols).toContain("enabled");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("aiInsights table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(aiInsights);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("hookExecutionId");
    expect(cols).toContain("entityType");
    expect(cols).toContain("entityId");
    expect(cols).toContain("provider");
    expect(cols).toContain("model");
    expect(cols).toContain("prompt");
    expect(cols).toContain("structuredOutput");
    expect(cols).toContain("fieldMappingResult");
    expect(cols).toContain("applied");
    expect(cols).toContain("createdAt");
  });
});

describe("aiChatMessages table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(aiChatMessages);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("role");
    expect(cols).toContain("content");
    expect(cols).toContain("toolCalls");
    expect(cols).toContain("metadata");
    expect(cols).toContain("createdAt");
  });
});

describe("emailAccounts table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(emailAccounts);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("email");
    expect(cols).toContain("encryptedImapHost");
    expect(cols).toContain("encryptedImapPort");
    expect(cols).toContain("encryptedImapUser");
    expect(cols).toContain("encryptedImapPassword");
    expect(cols).toContain("encryptedSmtpHost");
    expect(cols).toContain("encryptedSmtpPort");
    expect(cols).toContain("encryptedSmtpUser");
    expect(cols).toContain("encryptedSmtpPassword");
    expect(cols).toContain("syncEnabled");
    expect(cols).toContain("syncInterval");
    expect(cols).toContain("lastSyncAt");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("emailSyncState table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(emailSyncState);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("emailAccountId");
    expect(cols).toContain("folder");
    expect(cols).toContain("lastUid");
    expect(cols).toContain("uidValidity");
    expect(cols).toContain("lastSyncAt");
  });
});

describe("unmatchedEmails table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(unmatchedEmails);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("fromAddress");
    expect(cols).toContain("toAddress");
    expect(cols).toContain("subject");
    expect(cols).toContain("body");
    expect(cols).toContain("headers");
    expect(cols).toContain("receivedAt");
    expect(cols).toContain("linkedEntityType");
    expect(cols).toContain("linkedEntityId");
    expect(cols).toContain("createdAt");
  });
});

describe("apiKeys table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(apiKeys);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("keyHash");
    expect(cols).toContain("keyPrefix");
    expect(cols).toContain("lastUsedAt");
    expect(cols).toContain("createdAt");
  });
});

describe("subscriptions table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(subscriptions);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("stripeCustomerId");
    expect(cols).toContain("stripeSubscriptionId");
    expect(cols).toContain("status");
    expect(cols).toContain("currentPeriodStart");
    expect(cols).toContain("currentPeriodEnd");
    expect(cols).toContain("cancelAtPeriodEnd");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });
});

describe("notifications table", () => {
  it("has all required columns", () => {
    const cols = getColumnNames(notifications);
    expect(cols).toContain("id");
    expect(cols).toContain("userId");
    expect(cols).toContain("type");
    expect(cols).toContain("title");
    expect(cols).toContain("message");
    expect(cols).toContain("entityType");
    expect(cols).toContain("entityId");
    expect(cols).toContain("read");
    expect(cols).toContain("createdAt");
  });
});

// --- Relations tests ---

describe("automation relations", () => {
  it("defines events relations", () => {
    expect(eventsRelations).toBeDefined();
  });

  it("defines hooks relations", () => {
    expect(hooksRelations).toBeDefined();
  });

  it("defines hookExecutions relations", () => {
    expect(hookExecutionsRelations).toBeDefined();
  });

  it("defines incomingWebhooks relations", () => {
    expect(incomingWebhooksRelations).toBeDefined();
  });

  it("defines aiProviders relations", () => {
    expect(aiProvidersRelations).toBeDefined();
  });

  it("defines aiInsights relations", () => {
    expect(aiInsightsRelations).toBeDefined();
  });

  it("defines aiChatMessages relations", () => {
    expect(aiChatMessagesRelations).toBeDefined();
  });

  it("defines emailAccounts relations", () => {
    expect(emailAccountsRelations).toBeDefined();
  });

  it("defines emailSyncState relations", () => {
    expect(emailSyncStateRelations).toBeDefined();
  });

  it("defines unmatchedEmails relations", () => {
    expect(unmatchedEmailsRelations).toBeDefined();
  });

  it("defines apiKeys relations", () => {
    expect(apiKeysRelations).toBeDefined();
  });

  it("defines subscriptions relations", () => {
    expect(subscriptionsRelations).toBeDefined();
  });

  it("defines notifications relations", () => {
    expect(notificationsRelations).toBeDefined();
  });
});

// --- Schema index re-export test ---

describe("automation schema index re-exports", () => {
  it("exports all automation tables from schema index", async () => {
    const schema = await import("../src/schema/index");
    expect(schema.events).toBeDefined();
    expect(schema.hooks).toBeDefined();
    expect(schema.hookExecutions).toBeDefined();
    expect(schema.incomingWebhooks).toBeDefined();
    expect(schema.aiProviders).toBeDefined();
    expect(schema.aiInsights).toBeDefined();
    expect(schema.aiChatMessages).toBeDefined();
    expect(schema.emailAccounts).toBeDefined();
    expect(schema.emailSyncState).toBeDefined();
    expect(schema.unmatchedEmails).toBeDefined();
    expect(schema.apiKeys).toBeDefined();
    expect(schema.subscriptions).toBeDefined();
    expect(schema.notifications).toBeDefined();
  });
});
