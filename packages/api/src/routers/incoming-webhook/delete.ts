import { db } from "@DCRM/db";
import { incomingWebhooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { deleteIncomingWebhookSchema } from "./schemas";

export const deleteIncomingWebhook = protectedProcedure
  .input(deleteIncomingWebhookSchema)
  .mutation(async ({ ctx, input }) => {
    await db
      .delete(incomingWebhooks)
      .where(
        and(
          eq(incomingWebhooks.id, input.id),
          eq(incomingWebhooks.userId, ctx.user.id),
        ),
      );

    return { id: input.id };
  });
