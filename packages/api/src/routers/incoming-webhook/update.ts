import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { incomingWebhooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateIncomingWebhookSchema } from "./schemas";

export const updateIncomingWebhook = protectedProcedure
  .input(updateIncomingWebhookSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;

    const [existing] = await db
      .select({ id: incomingWebhooks.id })
      .from(incomingWebhooks)
      .where(
        and(
          eq(incomingWebhooks.id, id),
          eq(incomingWebhooks.userId, ctx.user.id),
        ),
      );

    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Incoming webhook not found" });
    }

    const setValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.secret !== undefined) setValues.secret = updates.secret;
    if (updates.mode !== undefined) setValues.mode = updates.mode;
    if (updates.mappingConfig !== undefined) setValues.mappingConfig = updates.mappingConfig;
    if (updates.enabled !== undefined) setValues.enabled = updates.enabled;

    await db
      .update(incomingWebhooks)
      .set(setValues)
      .where(
        and(
          eq(incomingWebhooks.id, id),
          eq(incomingWebhooks.userId, ctx.user.id),
        ),
      );

    return { id };
  });
