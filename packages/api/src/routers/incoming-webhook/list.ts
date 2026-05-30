import { db } from "@DCRM/db";
import { incomingWebhooks } from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const listIncomingWebhooks = protectedProcedure.query(async ({ ctx }) => {
  const rows = await db
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
    .where(eq(incomingWebhooks.userId, ctx.user.id));

  // Never expose the secret in list responses
  return rows.map((row) => ({
    ...row,
    hasSecret: false, // Placeholder — secrets are not returned
  }));
});
