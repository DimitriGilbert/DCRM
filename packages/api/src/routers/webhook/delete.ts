import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { HOOK_TYPES } from "@DCRM/domain";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { deleteOutgoingWebhookSchema } from "./schemas";

export const deleteOutgoingWebhook = protectedProcedure
  .input(deleteOutgoingWebhookSchema)
  .mutation(async ({ ctx, input }) => {
    const result = await db
      .delete(hooks)
      .where(
        and(
          eq(hooks.id, input.id),
          eq(hooks.userId, ctx.user.id),
          eq(hooks.type, HOOK_TYPES.OUTGOING_WEBHOOK),
        ),
      )
      .returning({ id: hooks.id });

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
    }

    return { id: input.id };
  });
