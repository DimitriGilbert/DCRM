import { db } from "@DCRM/db";
import { aiProviders } from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const listAIProviders = protectedProcedure.query(async ({ ctx }) => {
  const rows = await db
    .select({
      id: aiProviders.id,
      provider: aiProviders.provider,
      name: aiProviders.name,
      baseUrl: aiProviders.baseUrl,
      enabled: aiProviders.enabled,
      createdAt: aiProviders.createdAt,
      updatedAt: aiProviders.updatedAt,
    })
    .from(aiProviders)
    .where(eq(aiProviders.userId, ctx.user.id));

  return rows;
});
