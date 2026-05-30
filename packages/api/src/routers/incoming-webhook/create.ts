import { db } from "@DCRM/db";
import { incomingWebhooks } from "@DCRM/db/schema/automation";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createIncomingWebhookSchema } from "./schemas";

export const createIncomingWebhook = protectedProcedure
  .input(createIncomingWebhookSchema)
  .mutation(async ({ ctx, input }) => {
    const id = nanoid();
    const urlToken = nanoid(32);
    const now = new Date();

    await db.insert(incomingWebhooks).values({
      id,
      userId: ctx.user.id,
      name: input.name,
      urlToken,
      secret: input.secret ?? null,
      mode: "test", // New mappings ALWAYS start in test mode
      mappingConfig: input.mappingConfig ?? null,
      enabled: input.enabled,
      lastReceivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name: input.name,
      urlToken,
      mode: "test" as const,
      enabled: input.enabled,
      mappingConfig: input.mappingConfig ?? null,
      createdAt: now,
      updatedAt: now,
    };
  });
