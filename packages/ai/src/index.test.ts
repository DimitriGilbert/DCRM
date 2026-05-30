import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUILT_IN_AI_HOOK_TEMPLATES,
  createAiTextAdapter,
  executeStructuredAiHook,
  providerSettingsInputSchema,
  validateStructuredOutput,
} from "./index.js";

import type { AiFieldWriter, AiHookExecutionContext, AiHookModelRunner, JsonObject, StoreAiInsightInput } from "./index.js";

describe("TanStack AI provider adapters", () => {
  it("creates an OpenRouter adapter through the TanStack OpenAI-compatible adapter", () => {
    const adapter = createAiTextAdapter({ type: "openrouter", apiKey: "openrouter-key", model: "openai/gpt-5.1" });

    assert.equal(adapter.kind, "text");
    assert.equal(adapter.name, "openai");
  });

  it("creates OpenAI and Anthropic adapters with custom base URL compatibility", () => {
    const openai = createAiTextAdapter({ type: "openai", apiKey: "openai-key", model: "gpt-4o", baseUrl: "https://llm.example.test/v1" });
    const anthropic = createAiTextAdapter({ type: "anthropic", apiKey: "anthropic-key", model: "claude-sonnet-4-20250514", baseUrl: "https://claude.example.test" });

    assert.equal(openai.kind, "text");
    assert.equal(openai.name, "openai");
    assert.equal(anthropic.kind, "text");
    assert.equal(anthropic.name, "anthropic");
  });

  it("validates BYOK provider settings without accepting empty API keys", () => {
    assert.equal(providerSettingsInputSchema.safeParse({ name: "OpenAI", type: "openai", apiKey: "", defaultModel: "gpt-4o" }).success, false);
    assert.equal(providerSettingsInputSchema.safeParse({ name: "Google", type: "google", apiKey: "google-key", defaultModel: "gemini-2.5-pro" }).success, true);
  });
});

describe("structured AI hook execution", () => {
  it("stores a validated insight and proposes mapped field changes without writing fields", async () => {
    const insights = createRecordingInsightStore();
    const runner = createMockRunner({ summary: "Important client context", category: "vip" });
    const context = createAiHookContext({
      writeBehavior: "propose",
      fieldMappings: [{ sourcePath: "category", targetField: "metadata.aiCategory" }],
    });

    const result = await executeStructuredAiHook({
      context,
      runner,
      insights,
      clock: () => new Date("2026-05-30T16:00:00.000Z"),
      idGenerator: () => "insight_1",
    });

    assert.deepEqual(result.proposedChanges, { "metadata.aiCategory": "vip" });
    assert.equal(result.appliedChanges, undefined);
    assert.equal(insights.records.length, 1);
    assert.deepEqual(insights.records[0]?.structuredOutput, { summary: "Important client context", category: "vip" });
    assert.deepEqual(insights.records[0]?.metadata, {
      hookId: "hook_ai",
      eventId: "event_1",
      writeBehavior: "propose",
      proposedChanges: { "metadata.aiCategory": "vip" },
    });
  });

  it("stores insight and directly applies mapped changes with downstream suppression by default", async () => {
    const insights = createRecordingInsightStore();
    const writer = createRecordingFieldWriter();
    const runner = createMockRunner({ summary: "Updated profile", company: "Example Studio" });
    const context = createAiHookContext({
      writeBehavior: "direct",
      fieldMappings: [{ sourcePath: "company", targetField: "company" }],
    });

    const result = await executeStructuredAiHook({
      context,
      runner,
      insights,
      fieldWriter: writer,
      idGenerator: () => "insight_2",
    });

    assert.deepEqual(result.appliedChanges, { company: "Example Studio" });
    assert.equal(insights.records.length, 1);
    assert.deepEqual(writer.calls, [
      {
        userId: "user_1",
        entity: { type: "client", id: "client_1" },
        changes: { company: "Example Studio" },
        provenance: {
          hookId: "hook_ai",
          hookExecutionId: "execution_1",
          triggeringEventId: "event_1",
        },
        downstreamEventBehavior: "suppress",
      },
    ]);
  });

  it("rejects unstructured model output before insight storage or field mapping", async () => {
    const insights = createRecordingInsightStore();
    const runner = createMockRunner({ summary: 42 });
    const context = createAiHookContext({ writeBehavior: "propose" });

    await assert.rejects(
      executeStructuredAiHook({ context, runner, insights }),
      /Invalid input/u,
    );
    assert.equal(insights.records.length, 0);
  });

  it("exposes all required built-in AI hook templates", () => {
    assert.deepEqual(Object.keys(BUILT_IN_AI_HOOK_TEMPLATES), ["summarize", "classify", "extract_contacts", "enrich_from_web"]);
    assert.deepEqual(validateStructuredOutput({ summary: "ok" }, BUILT_IN_AI_HOOK_TEMPLATES.summarize.outputFields), { summary: "ok" });
  });
});

function createMockRunner(output: unknown): AiHookModelRunner {
  return {
    async generateStructured() {
      return output;
    },
  };
}

function createRecordingInsightStore() {
  const records: StoreAiInsightInput[] = [];
  return {
    records,
    async create(input: StoreAiInsightInput) {
      records.push(input);
    },
  };
}

function createRecordingFieldWriter() {
  const calls: Parameters<AiFieldWriter["apply"]>[0][] = [];
  return {
    calls,
    async apply(input: Parameters<AiFieldWriter["apply"]>[0]): Promise<JsonObject> {
      calls.push(input);
      return input.changes;
    },
  };
}

function createAiHookContext(config: Partial<AiHookExecutionContext["hook"]["config"]>): AiHookExecutionContext {
  return {
    event: {
      id: "event_1",
      type: "client.created",
      userId: "user_1",
      source: "app",
      entity: { type: "client", id: "client_1" },
      payload: { name: "Ada" },
      createdAt: new Date("2026-05-30T15:00:00.000Z"),
    },
    hook: {
      id: "hook_ai",
      userId: "user_1",
      name: "Client enrichment",
      config: {
        providerId: "provider_1",
        model: "openai/gpt-5.1",
        template: "summarize",
        outputFields: [
          { name: "summary", type: "string", required: true },
          { name: "category", type: "string", required: false },
          { name: "company", type: "string", required: false },
        ],
        fieldMappings: [],
        downstreamEventBehavior: "suppress",
        ...config,
      },
    },
    execution: { id: "execution_1" },
  };
}
