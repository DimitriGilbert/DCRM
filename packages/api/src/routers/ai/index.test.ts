import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSecretCrypto } from "@DCRM/crypto";
import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryAutomationRepository } from "../../automation/repository.js";
import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";

describe("AI provider settings tRPC API", () => {
  it("stores BYOK provider credentials encrypted and lists only safe fields for the current user", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const context = createTestContext("user_1", automationRepository);
    const secretCrypto = requireTestSecretCrypto(context.secretCrypto);
    const caller = appRouter.createCaller(context);

    const saved = await caller.ai.upsertProvider({
      name: "OpenAI compatible",
      type: "openai",
      apiKey: "secret-openai-key",
      baseUrl: "https://llm.example.test/v1",
      defaultModel: "gpt-4o",
      enabled: true,
    });

    assert.equal(saved.name, "OpenAI compatible");
    assert.equal(saved.type, "openai");
    assert.equal(saved.baseUrl, "https://llm.example.test/v1");
    assert.equal(saved.defaultModel, "gpt-4o");
    assert.equal(saved.hasApiKey, true);
    assert.equal("apiKey" in saved, false);

    const raw = await automationRepository.aiProviders.getDecrypted({ userId: "user_1", id: saved.id, crypto: secretCrypto });
    assert.equal(raw?.apiKey, "secret-openai-key");
    assert.equal(JSON.stringify(await automationRepository.aiProviders.listEncrypted({ userId: "user_1" })).includes("secret-openai-key"), false);

    assert.equal((await caller.ai.listProviders()).length, 1);
    assert.equal((await appRouter.createCaller(createTestContext("user_2", automationRepository)).ai.listProviders()).length, 0);
  });

  it("does not let another user overwrite a provider by supplying its id", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const userOneContext = createTestContext("user_1", automationRepository);
    const secretCrypto = requireTestSecretCrypto(userOneContext.secretCrypto);
    const userOneCaller = appRouter.createCaller(userOneContext);

    const saved = await userOneCaller.ai.upsertProvider({
      name: "User one OpenAI",
      type: "openai",
      apiKey: "user-one-key",
      baseUrl: "https://llm.example.test/v1",
      defaultModel: "gpt-4o",
      enabled: true,
    });

    await assert.rejects(
      appRouter.createCaller(createTestContext("user_2", automationRepository)).ai.upsertProvider({
        id: saved.id,
        name: "User two overwrite attempt",
        type: "anthropic",
        apiKey: "user-two-key",
        baseUrl: "",
        defaultModel: "claude-3-5-sonnet-latest",
        enabled: false,
      }),
    );

    const raw = await automationRepository.aiProviders.getDecrypted({ userId: "user_1", id: saved.id, crypto: secretCrypto });
    assert.equal(raw?.name, "User one OpenAI");
    assert.equal(raw?.type, "openai");
    assert.equal(raw?.apiKey, "user-one-key");
    assert.equal((await appRouter.createCaller(createTestContext("user_2", automationRepository)).ai.listProviders()).length, 0);
  });
});

function createTestContext(userId: string, automationRepository: ReturnType<typeof createInMemoryAutomationRepository>): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    automationRepository,
    crmRepository: createInMemoryCrmRepository(),
    eventService: createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => `event_${userId}` }),
    secretCrypto: createSecretCrypto({ ENCRYPTION_KEY: "a".repeat(32) }),
    session: null,
  };
}

function requireTestSecretCrypto(secretCrypto: Context["secretCrypto"]) {
  if (!secretCrypto) {
    throw new Error("Test context requires secret crypto.");
  }
  return secretCrypto;
}
