import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { aiProviders } from "@DCRM/db/schema/automation";
import { createCrypto } from "@DCRM/crypto";
import { env } from "@DCRM/env/server";
import { ProviderManager, sendMessage } from "@DCRM/ai";
import type { ChatDeps } from "@DCRM/ai";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { sendMessageSchema } from "./schemas";
import { createCRMToolDataAccess, createMessageStore } from "./data-access";

export const sendAIMessage = protectedProcedure
  .input(sendMessageSchema)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    // encryptedApiKey is selected for internal decryption only — it must NEVER
    // be included in the tRPC response. It is consumed by ProviderManager below
    // and not leaked through the return value.
    const providerRows = await db
      .select({
        id: aiProviders.id,
        userId: aiProviders.userId,
        provider: aiProviders.provider,
        name: aiProviders.name,
        encryptedApiKey: aiProviders.encryptedApiKey,
        baseUrl: aiProviders.baseUrl,
        config: aiProviders.config,
        enabled: aiProviders.enabled,
      })
      .from(aiProviders)
      .where(and(eq(aiProviders.id, input.providerId), eq(aiProviders.userId, userId)))
      .limit(1);

    const providerRecord = providerRows[0];
    if (!providerRecord) {
      throw new TRPCError({ code: "NOT_FOUND", message: "AI provider not found or access denied" });
    }
    if (!providerRecord.enabled) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "AI provider is disabled" });
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
