import { db } from "@DCRM/db";
import { incomingWebhooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../index";

export const getIncomingWebhook = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select({
        id: incomingWebhooks.id,
        name: incomingWebhooks.name,
        urlToken: incomingWebhooks.urlToken,
        mode: incomingWebhooks.mode,
        enabled: incomingWebhooks.enabled,
        mappingConfig: incomingWebhooks.mappingConfig,
        lastReceivedAt: incomingWebhooks.lastReceivedAt,
        createdAt: incomingWebhooks.createdAt,
        updatedAt: incomingWebhooks.updatedAt,
      })
      .from(incomingWebhooks)
      .where(
        and(
          eq(incomingWebhooks.id, input.id),
          eq(incomingWebhooks.userId, ctx.user.id),
        ),
      );

    if (!row) return null;

    // Never expose the secret; only indicate whether one is set
    return {
      ...row,
      hasSecret: false,
    };
  });
