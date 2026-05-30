import { normalizeProviderSettingsInput, providerSettingsInputSchema } from "@DCRM/ai";
import type { SecretCrypto } from "@DCRM/crypto";
import { z } from "zod";

import { protectedProcedure, router } from "../../index.js";
import { sendAiChatMessage } from "../../ai/chat-service.js";

import type { AutomationRepository } from "../../automation/repository.js";

const providerIdInput = z.object({ id: z.string().min(1).optional() });
const chatInputSchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).max(4000),
  providerId: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).max(160).optional(),
});
const conversationInputSchema = z.object({ conversationId: z.string().trim().min(1) });

export const aiRouter = router({
  listProviders: protectedProcedure.query(async ({ ctx }) => {
    return requireAutomationRepository(ctx.automationRepository).aiProviders.listSafe({ userId: ctx.auth.user.id });
  }),
  upsertProvider: protectedProcedure.input(providerSettingsInputSchema.merge(providerIdInput)).mutation(async ({ ctx, input }) => {
    const normalized = normalizeProviderSettingsInput(input);
    const secretCrypto = requireSecretCrypto(ctx.secretCrypto);
    return requireAutomationRepository(ctx.automationRepository).aiProviders.upsertEncrypted({
      id: input.id,
      userId: ctx.auth.user.id,
      name: normalized.name,
      type: normalized.type,
      encryptedApiKey: secretCrypto.encrypt(normalized.apiKey),
      baseUrl: normalized.baseUrl,
      defaultModel: normalized.defaultModel,
      enabled: normalized.enabled,
      now: new Date(),
    });
  }),
  listChatMessages: protectedProcedure.input(conversationInputSchema).query(async ({ ctx, input }) => {
    return requireAutomationRepository(ctx.automationRepository).aiMessages.listConversation({ userId: ctx.auth.user.id, conversationId: input.conversationId });
  }),
  sendChatMessage: protectedProcedure.input(chatInputSchema).mutation(async ({ ctx, input }) => {
    return sendAiChatMessage({
      userId: ctx.auth.user.id,
      message: input.message,
      conversationId: input.conversationId,
      providerId: input.providerId,
      model: input.model,
      crmRepository: ctx.crmRepository,
      automationRepository: requireAutomationRepository(ctx.automationRepository),
      secretCrypto: requireSecretCrypto(ctx.secretCrypto),
      runner: ctx.aiChatRunner,
    });
  }),
});

function requireAutomationRepository(automationRepository: AutomationRepository | undefined): AutomationRepository {
  if (!automationRepository) {
    throw new Error("Automation repository is required for AI provider settings.");
  }
  return automationRepository;
}

function requireSecretCrypto(secretCrypto: SecretCrypto | undefined): SecretCrypto {
  if (!secretCrypto) {
    throw new Error("Secret crypto is required for AI provider credentials.");
  }
  return secretCrypto;
}
