import { db } from "@DCRM/db";
import { aiProviders } from "@DCRM/db/schema/automation";
import { createCrypto } from "@DCRM/crypto";
import { env } from "@DCRM/env/server";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createAIProviderSchema } from "./schemas";

export const createAIProvider = protectedProcedure
  .input(createAIProviderSchema)
  .mutation(async ({ ctx, input }) => {
    const crypto = createCrypto(env.ENCRYPTION_KEY);
    const encryptedApiKey = crypto.encrypt(input.apiKey);

    const id = nanoid();
    const config: Record<string, unknown> = {
      ...(input.defaultModel ? { defaultModel: input.defaultModel } : {}),
      ...(input.config ?? {}),
    };

    const now = new Date();

    await db.insert(aiProviders).values({
      id,
      userId: ctx.user.id,
      provider: input.provider,
      name: input.name,
      encryptedApiKey: JSON.stringify(encryptedApiKey),
      baseUrl: input.baseUrl ?? null,
      config,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      provider: input.provider,
      name: input.name,
      baseUrl: input.baseUrl ?? null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  });
