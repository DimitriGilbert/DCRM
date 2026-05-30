import { db } from "@DCRM/db";
import { aiProviders } from "@DCRM/db/schema/automation";
import { createCrypto } from "@DCRM/crypto";
import { env } from "@DCRM/env/server";
import { ProviderManager, sendMessage } from "@DCRM/ai";
import type { ChatDeps } from "@DCRM/ai";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { sendMessageSchema } from "./schemas";
import { createCRMToolDataAccess, createMessageStore } from "./data-access";

export const sendAIMessage = protectedProcedure
  .input(sendMessageSchema)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    // 1. Resolve provider
    const providerRows = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, input.providerId))
      .limit(1);

    const providerRecord = providerRows[0];
    if (!providerRecord || providerRecord.userId !== userId) {
      throw new Error("AI provider not found or access denied");
    }
    if (!providerRecord.enabled) {
      throw new Error("AI provider is disabled");
    }

    // 2. Build adapter
    const crypto = createCrypto(env.ENCRYPTION_KEY);
    const providerManager = new ProviderManager(crypto);
    const providerConfig = providerManager.buildConfig({
      id: providerRecord.id,
      userId: providerRecord.userId,
      provider: providerRecord.provider,
      name: providerRecord.name,
      encryptedApiKey: providerRecord.encryptedApiKey,
      baseUrl: providerRecord.baseUrl,
      config: providerRecord.config,
      enabled: providerRecord.enabled,
    });

    const model = input.model ?? providerConfig.defaultModel;
    const adapter = providerManager.createAdapter(providerConfig, model);

    // 3. Build deps
    const messageStore = createMessageStore(userId);
    const crmDeps = createCRMToolDataAccess(userId);

    const chatDeps: ChatDeps = {
      adapter,
      provider: providerRecord.provider,
      model,
      messageStore,
      crmDeps,
    };

    // 4. Send message
    return sendMessage(
      { userId, content: input.content, providerId: input.providerId, model },
      chatDeps,
    );
  });
