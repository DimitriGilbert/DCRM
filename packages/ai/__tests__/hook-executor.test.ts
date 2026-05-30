import { describe, expect, it, vi, beforeEach } from "vitest";

import type {
  AIHookExecutionInput,
  AIInsightRecord,
  AIInsightStore,
  EntityUpdateFn,
  EntityFetchFn,
} from "../src/hook-executor";
import type { ProviderManager, ProviderRecord } from "../src/provider-manager";

// --- Mock TanStack AI chat function ---
vi.mock("@tanstack/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/ai")>();
  return {
    ...actual,
    chat: vi.fn(),
  };
});

// Must import after mock
import { chat } from "@tanstack/ai";
import { executeAIHook } from "../src/hook-executor";

const mockChat = vi.mocked(chat);

// --- Test fixtures ---

function makeProviderRecord(): ProviderRecord {
  return {
    id: "provider-1",
    userId: "user-1",
    provider: "openai",
    name: "Test OpenAI",
    encryptedApiKey: JSON.stringify({ iv: "test", data: "test" }),
    baseUrl: null,
    config: null,
    enabled: true,
  };
}

function makeProviderManager(): ProviderManager {
  return {
    buildConfig: vi.fn().mockReturnValue({
      id: "provider-1",
      provider: "openai",
      name: "Test OpenAI",
      apiKey: "sk-test-key",
      defaultModel: "gpt-4o",
    }),
    createAdapter: vi.fn().mockReturnValue({}),
    decryptApiKey: vi.fn().mockReturnValue("sk-test-key"),
  } as unknown as ProviderManager;
}

function makeInsightStore(): AIInsightStore {
  return {
    insert: vi.fn(),
  };
}

function makeEntityUpdateFn(): EntityUpdateFn {
  return vi.fn();
}

function makeEntityFetchFn(): EntityFetchFn {
  return vi.fn().mockResolvedValue({ name: "Test Client", notes: null });
}

function makeBaseInput(overrides?: Partial<AIHookExecutionInput>): AIHookExecutionInput {
  return {
    hookId: "hook-1",
    hookName: "Test AI Hook",
    userId: "user-1",
    eventId: "event-1",
    executionId: "exec-1",
    config: {
      templateId: "summarize",
      providerId: "provider-1",
    },
    writeBehavior: "propose_first",
    emitDownstreamEvents: false,
    eventType: "client.created",
    entityType: "client",
    entityId: "client-1",
    eventPayload: { name: "Acme Corp", email: "info@acme.com" },
    ...overrides,
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeAIHook — propose_first mode", () => {
  it("stores insight without applying fields", async () => {
    mockChat.mockResolvedValue({
      summary: "A new corporate client.",
      key_points: ["B2B client", "Corporate account"],
      sentiment: "neutral",
      confidence: 0.85,
    });

    const providerStore = {
      getById: vi.fn().mockResolvedValue(makeProviderRecord()),
    };
    const insightStore = makeInsightStore();
    const entityUpdateFn = makeEntityUpdateFn();
    const entityFetchFn = makeEntityFetchFn();

    const result = await executeAIHook(makeBaseInput(), {
      providerManager: makeProviderManager(),
      providerStore,
      insightStore,
      entityUpdateFn,
      entityFetchFn,
    });

    // Insight was stored
    expect(insightStore.insert).toHaveBeenCalledOnce();
    const stored = (insightStore.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as AIInsightRecord;
    expect(stored.applied).toBe(false);
    expect(stored.structuredOutput).toEqual({
      summary: "A new corporate client.",
      key_points: ["B2B client", "Corporate account"],
      sentiment: "neutral",
      confidence: 0.85,
    });

    // Entity was NOT updated (propose_first)
    expect(entityUpdateFn).not.toHaveBeenCalled();

    // Result reflects propose-first behavior
    expect(result.applied).toBe(false);
    expect(result.fieldMappingResult).not.toBeNull();
  });

  it("stores insight even when no entity target exists", async () => {
    mockChat.mockResolvedValue({
      summary: "Summary of event",
      key_points: [],
      sentiment: "neutral",
      confidence: 0.5,
    });

    const input = makeBaseInput({
      entityType: undefined,
      entityId: undefined,
    });

    const providerStore = {
      getById: vi.fn().mockResolvedValue(makeProviderRecord()),
    };
    const insightStore = makeInsightStore();

    const result = await executeAIHook(input, {
      providerManager: makeProviderManager(),
      providerStore,
      insightStore,
      entityUpdateFn: makeEntityUpdateFn(),
      entityFetchFn: makeEntityFetchFn(),
    });

    expect(insightStore.insert).toHaveBeenCalledOnce();
    expect(result.applied).toBe(false);
    expect(result.fieldMappingResult).toBeNull();
  });
});

describe("executeAIHook — direct_write mode", () => {
  it("applies mapped fields when writeBehavior is direct_write", async () => {
    mockChat.mockResolvedValue({
      summary: "Updated summary",
      key_points: ["Key point 1"],
      sentiment: "positive",
      confidence: 0.9,
    });

    const input = makeBaseInput({
      writeBehavior: "direct_write",
      config: {
        templateId: "summarize",
        providerId: "provider-1",
        fieldMapping: {
          summary: "notes",
          sentiment: "customFields.sentiment",
        },
      },
    });

    const providerStore = {
      getById: vi.fn().mockResolvedValue(makeProviderRecord()),
    };
    const insightStore = makeInsightStore();
    const entityUpdateFn = makeEntityUpdateFn();
    const entityFetchFn = makeEntityFetchFn();

    const result = await executeAIHook(input, {
      providerManager: makeProviderManager(),
      providerStore,
      insightStore,
      entityUpdateFn,
      entityFetchFn,
    });

    // Entity was updated with mapped fields
    expect(entityUpdateFn).toHaveBeenCalledOnce();
    const updateCall = (entityUpdateFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[0]).toBe("client");
    expect(updateCall[1]).toBe("client-1");
    expect(updateCall[2]).toBe("user-1");
    expect(updateCall[3]).toHaveProperty("notes", "Updated summary");

    // Provenance carries hook context for loop suppression
    expect(updateCall[4].hookExecutionId).toBe("exec-1");
    expect(updateCall[4].eventId).toBe("event-1");
    expect(updateCall[4].emitDownstreamEvents).toBe(false);

    // Result reflects direct write
    expect(result.applied).toBe(true);

    // Insight stored as applied
    const stored = (insightStore.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as AIInsightRecord;
    expect(stored.applied).toBe(true);
  });

  it("respects emitDownstreamEvents when set to true", async () => {
    mockChat.mockResolvedValue({
      summary: "Summary",
      key_points: [],
      sentiment: "neutral",
      confidence: 0.7,
    });

    const input = makeBaseInput({
      writeBehavior: "direct_write",
      emitDownstreamEvents: true,
      config: {
        templateId: "summarize",
        providerId: "provider-1",
        fieldMapping: { summary: "notes" },
      },
    });

    const providerStore = {
      getById: vi.fn().mockResolvedValue(makeProviderRecord()),
    };
    const entityUpdateFn = makeEntityUpdateFn();

    await executeAIHook(input, {
      providerManager: makeProviderManager(),
      providerStore,
      insightStore: makeInsightStore(),
      entityUpdateFn,
      entityFetchFn: makeEntityFetchFn(),
    });

    const updateCall = (entityUpdateFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[4].emitDownstreamEvents).toBe(true);
  });
});

describe("executeAIHook — provider validation", () => {
  it("throws when provider not found", async () => {
    const providerStore = {
      getById: vi.fn().mockResolvedValue(null),
    };

    await expect(
      executeAIHook(makeBaseInput(), {
        providerManager: makeProviderManager(),
        providerStore,
        insightStore: makeInsightStore(),
        entityUpdateFn: makeEntityUpdateFn(),
        entityFetchFn: makeEntityFetchFn(),
      }),
    ).rejects.toThrow("AI provider not found: provider-1");
  });

  it("throws when provider is disabled", async () => {
    const disabledProvider = { ...makeProviderRecord(), enabled: false };
    const providerStore = {
      getById: vi.fn().mockResolvedValue(disabledProvider),
    };

    await expect(
      executeAIHook(makeBaseInput(), {
        providerManager: makeProviderManager(),
        providerStore,
        insightStore: makeInsightStore(),
        entityUpdateFn: makeEntityUpdateFn(),
        entityFetchFn: makeEntityFetchFn(),
      }),
    ).rejects.toThrow("AI provider is disabled");
  });
});

describe("executeAIHook — custom template", () => {
  it("uses custom prompts and schema when provided", async () => {
    mockChat.mockResolvedValue({
      category: "technology",
      priority: "high",
    });

    const input = makeBaseInput({
      config: {
        providerId: "provider-1",
        systemPrompt: "Custom system prompt for classification.",
        userPromptTemplate: "Classify this entity: {payload}",
        outputSchema: {
          type: "object",
          properties: {
            category: { type: "string" },
            priority: { type: "string" },
          },
        },
        fieldMapping: { category: "notes" },
      },
    });

    const providerStore = {
      getById: vi.fn().mockResolvedValue(makeProviderRecord()),
    };
    const insightStore = makeInsightStore();

    const result = await executeAIHook(input, {
      providerManager: makeProviderManager(),
      providerStore,
      insightStore,
      entityUpdateFn: makeEntityUpdateFn(),
      entityFetchFn: makeEntityFetchFn(),
    });

    expect(result.structuredOutput).toEqual({
      category: "technology",
      priority: "high",
    });

    // Verify the chat was called with custom system prompt via systemPrompts
    const chatCall = mockChat.mock.calls[0][0];
    expect(chatCall.systemPrompts[0]).toBe("Custom system prompt for classification.");
  });

  it("uses model override when specified", async () => {
    mockChat.mockResolvedValue({ raw_text: "test" });

    const input = makeBaseInput({
      config: {
        templateId: "summarize",
        providerId: "provider-1",
        model: "gpt-4o-mini",
      },
    });

    const providerStore = {
      getById: vi.fn().mockResolvedValue(makeProviderRecord()),
    };

    const providerManager = makeProviderManager();

    await executeAIHook(input, {
      providerManager,
      providerStore,
      insightStore: makeInsightStore(),
      entityUpdateFn: makeEntityUpdateFn(),
      entityFetchFn: makeEntityFetchFn(),
    });

    // ProviderManager.createAdapter called with model override
    expect(providerManager.createAdapter).toHaveBeenCalledWith(
      expect.anything(),
      "gpt-4o-mini",
    );
  });
});
