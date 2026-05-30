import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createOutgoingWebhookSchema } from "./schemas";
import { buildEncryptedAuth } from "./auth-builder";

export const createOutgoingWebhook = protectedProcedure
  .input(createOutgoingWebhookSchema)
  .mutation(async ({ ctx, input }) => {
    const id = nanoid();
    const now = new Date();

    const auth = buildEncryptedAuth(input.authConfig ?? { mode: "none" });

    const config: Record<string, unknown> = {
      url: input.url,
      auth,
      method: input.method,
      headers: input.headers ?? {},
      timeoutMs: input.timeoutMs,
      maxRetries: input.maxRetries,
    };

    await db.insert(hooks).values({
      id,
      userId: ctx.user.id,
      name: input.name,
      type: "outgoing_webhook",
      eventType: input.eventType,
      enabled: input.enabled,
      config,
      outputSchema: null,
      fieldMapping: null,
      writeBehavior: "propose_first",
      emitDownstreamEvents: false,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name: input.name,
      type: "outgoing_webhook" as const,
      eventType: input.eventType,
      enabled: input.enabled,
      url: input.url,
      method: input.method,
      authMode: auth.mode,
      headers: input.headers ?? {},
      timeoutMs: input.timeoutMs,
      maxRetries: input.maxRetries,
      createdAt: now,
      updatedAt: now,
    };
  });
