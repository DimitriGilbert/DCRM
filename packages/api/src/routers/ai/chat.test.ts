import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSecretCrypto } from "@DCRM/crypto";
import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryAutomationRepository } from "../../automation/repository.js";
import { sendAiChatMessage } from "../../ai/chat-service.js";
import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { CrmChatRunner } from "@DCRM/ai";
import type { Context } from "../../context.js";

const testEncryptionKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

describe("AI chat assistant", () => {
  it("persists a multi-turn conversation and gives the mocked provider audited CRM tool output", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const crmRepository = createInMemoryCrmRepository();
    const calls: Parameters<CrmChatRunner["generate"]>[0][] = [];
    const runner: CrmChatRunner = {
      async generate(input) {
        calls.push(input);
        return { content: `Saw ${input.toolResults.length} audited tools after ${input.messages.length} messages.` };
      },
    };
    const caller = appRouter.createCaller(createTestContext({ userId: "user_1", automationRepository, crmRepository, runner }));
    const otherUser = appRouter.createCaller(createTestContext({ userId: "user_2", automationRepository, crmRepository, runner }));
    const provider = await caller.ai.upsertProvider({ name: "OpenAI", type: "openai", apiKey: "secret", baseUrl: "", defaultModel: "gpt-4o-mini", enabled: true });
    await caller.clients.create({ name: "Ada Lovelace", company: "Analytical Engines" });

    const first = await caller.ai.sendChatMessage({ providerId: provider.id, message: "Find Ada and summarize my work." });
    const second = await caller.ai.sendChatMessage({ conversationId: first.conversationId, providerId: provider.id, message: "What should I do next?" });

    assert.equal(first.history.map((message) => message.role).join(","), "user,tool,tool,tool,tool,tool,assistant");
    assert.equal(second.conversationId, first.conversationId);
    assert.equal(second.history.filter((message) => message.role === "user").length, 2);
    assert.deepEqual(calls[0]?.toolResults.map((result) => result.name), ["searchClients", "summarizeProject", "listOpenTickets", "pipelineSummary", "recentExchanges"]);
    assert.equal(calls[0]?.toolResults[0]?.output.clients instanceof Array, true);
    assert.equal(JSON.stringify(calls[0]?.toolResults).includes("Ada Lovelace"), true);
    assert.equal(second.toolMessages.every((message) => message.metadata.auditable === true), true);
    assert.equal((await otherUser.ai.listChatMessages({ conversationId: first.conversationId })).length, 0);
  });

  it("persists chat turns with stable message order inside each turn and across history", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const crmRepository = createInMemoryCrmRepository();
    const secretCrypto = createSecretCrypto({ ENCRYPTION_KEY: testEncryptionKey });
    const generatedIds = createSequentialIdGenerator("chat_order");
    const calls: Parameters<CrmChatRunner["generate"]>[0][] = [];
    const runner: CrmChatRunner = {
      async generate(input) {
        calls.push(input);
        return { content: `Response ${calls.length}` };
      },
    };
    const firstTurnAt = new Date("2026-01-01T10:00:00.000Z");
    const secondTurnAt = new Date("2026-01-01T10:01:00.000Z");
    const provider = await automationRepository.aiProviders.upsertEncrypted({
      userId: "user_order",
      name: "OpenAI",
      type: "openai",
      encryptedApiKey: secretCrypto.encrypt("secret"),
      baseUrl: null,
      defaultModel: "gpt-4o-mini",
      enabled: true,
      now: firstTurnAt,
    });

    const first = await sendAiChatMessage({
      userId: "user_order",
      message: "Summarize my CRM.",
      providerId: provider.id,
      crmRepository,
      automationRepository,
      secretCrypto,
      runner,
      now: firstTurnAt,
      idGenerator: generatedIds,
    });
    const second = await sendAiChatMessage({
      userId: "user_order",
      message: "What changed?",
      conversationId: first.conversationId,
      providerId: provider.id,
      crmRepository,
      automationRepository,
      secretCrypto,
      runner,
      now: secondTurnAt,
      idGenerator: generatedIds,
    });

    assert.deepEqual(first.history.map((message) => message.role), ["user", "tool", "tool", "tool", "tool", "tool", "assistant"]);
    assert.deepEqual(calls[1]?.messages.map((message) => message.role), ["user", "tool", "tool", "tool", "tool", "tool", "assistant", "user", "tool", "tool", "tool", "tool", "tool"]);
    assert.deepEqual(second.history.map((message) => message.role), ["user", "tool", "tool", "tool", "tool", "tool", "assistant", "user", "tool", "tool", "tool", "tool", "tool", "assistant"]);
    assert.equal(hasStrictlyIncreasingCreationTimes(first.history), true);
    assert.equal(hasStrictlyIncreasingCreationTimes(second.history), true);
  });
});

function createSequentialIdGenerator(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}_${(index += 1).toString().padStart(2, "0")}`;
}

function hasStrictlyIncreasingCreationTimes(messages: readonly { readonly createdAt: Date }[]): boolean {
  let previousTime: number | undefined;
  for (const message of messages) {
    const currentTime = message.createdAt.getTime();
    if (previousTime !== undefined && currentTime <= previousTime) {
      return false;
    }
    previousTime = currentTime;
  }
  return true;
}

function createTestContext(input: { readonly userId: string; readonly automationRepository: ReturnType<typeof createInMemoryAutomationRepository>; readonly crmRepository: ReturnType<typeof createInMemoryCrmRepository>; readonly runner: CrmChatRunner }): Context {
  return {
    auth: { kind: "session", user: { id: input.userId, email: `${input.userId}@example.com`, name: input.userId, image: null } },
    aiChatRunner: input.runner,
    automationRepository: input.automationRepository,
    crmRepository: input.crmRepository,
    eventService: createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => `event_${input.userId}` }),
    secretCrypto: createSecretCrypto({ ENCRYPTION_KEY: testEncryptionKey }),
    session: null,
  };
}
