import { db } from "@DCRM/db";
import { aiProviders } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../index";

export const getAIProvider = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select({
        id: aiProviders.id,
        provider: aiProviders.provider,
        name: aiProviders.name,
        baseUrl: aiProviders.baseUrl,
        config: aiProviders.config,
        enabled: aiProviders.enabled,
        createdAt: aiProviders.createdAt,
        updatedAt: aiProviders.updatedAt,
      })
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.id, input.id),
          eq(aiProviders.userId, ctx.user.id),
        ),
      );

    return row ?? null;
  });
