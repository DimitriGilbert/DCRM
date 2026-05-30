import { db } from "@DCRM/db";
import { aiProviders } from "@DCRM/db/schema/automation";
import { createCrypto } from "@DCRM/crypto";
import { env } from "@DCRM/env/server";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateAIProviderSchema } from "./schemas";

export const updateAIProvider = protectedProcedure
  .input(updateAIProviderSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, apiKey, ...rest } = input;

    // Verify ownership
    const [existing] = await db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, ctx.user.id)));

    if (!existing) {
      return null;
    }

    const updates: Partial<typeof aiProviders.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (rest.name !== undefined) updates.name = rest.name;
    if (rest.baseUrl !== undefined) updates.baseUrl = rest.baseUrl;
    if (rest.enabled !== undefined) updates.enabled = rest.enabled;

    if (rest.defaultModel !== undefined || rest.config !== undefined) {
      const currentConfig =
        (await db
          .select({ config: aiProviders.config })
          .from(aiProviders)
          .where(eq(aiProviders.id, id)))?.[0]?.config ?? {};

      const newConfig = { ...(currentConfig as Record<string, unknown>) };
      if (rest.defaultModel !== undefined) {
        newConfig.defaultModel = rest.defaultModel;
      }
      if (rest.config !== undefined) {
        if (rest.config === null) {
          updates.config = {};
        } else {
          Object.assign(newConfig, rest.config);
          updates.config = newConfig;
        }
      } else {
        updates.config = newConfig;
      }
    }

    if (apiKey) {
      const crypto = createCrypto(env.ENCRYPTION_KEY);
      const encryptedApiKey = crypto.encrypt(apiKey);
      updates.encryptedApiKey = JSON.stringify(encryptedApiKey);
    }

    const setPayload = { ...updates } as Record<string, unknown>;
    await db
      .update(aiProviders)
      .set(setPayload)
      .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, ctx.user.id)));

    return { id };
  });
