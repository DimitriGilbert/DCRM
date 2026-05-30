import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { HOOK_TYPES } from "@DCRM/domain";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateOutgoingWebhookSchema } from "./schemas";
import { buildEncryptedAuth } from "./auth-builder";

export const updateOutgoingWebhook = protectedProcedure
  .input(updateOutgoingWebhookSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;

    const [existing] = await db
      .select({ config: hooks.config })
      .from(hooks)
      .where(
        and(
          eq(hooks.id, id),
          eq(hooks.userId, ctx.user.id),
          eq(hooks.type, HOOK_TYPES.OUTGOING_WEBHOOK),
        ),
      );

    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
    }

    const existingConfig = existing.config as Record<string, unknown>;

    // Build new config by merging
    const newConfig: Record<string, unknown> = {
      ...existingConfig,
    };

    if (updates.url !== undefined) newConfig["url"] = updates.url;
    if (updates.method !== undefined) newConfig["method"] = updates.method;
    if (updates.headers !== undefined) newConfig["headers"] = updates.headers ?? {};
    if (updates.timeoutMs !== undefined) newConfig["timeoutMs"] = updates.timeoutMs;
    if (updates.maxRetries !== undefined) newConfig["maxRetries"] = updates.maxRetries;

    // Re-encrypt auth if provided
    if (updates.authConfig !== undefined) {
      newConfig["auth"] = buildEncryptedAuth(updates.authConfig);
    }

    const setValues: Record<string, unknown> = {
      config: newConfig,
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.eventType !== undefined) setValues.eventType = updates.eventType;
    if (updates.enabled !== undefined) setValues.enabled = updates.enabled;

    await db
      .update(hooks)
      .set(setValues)
      .where(
        and(
          eq(hooks.id, id),
          eq(hooks.userId, ctx.user.id),
          eq(hooks.type, HOOK_TYPES.OUTGOING_WEBHOOK),
        ),
      );

    return { id };
  });
