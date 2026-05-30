import { db } from "@DCRM/db";
import { aiProviders } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { deleteAIProviderSchema } from "./schemas";

export const deleteAIProvider = protectedProcedure
  .input(deleteAIProviderSchema)
  .mutation(async ({ ctx, input }) => {
    const result = await db
      .delete(aiProviders)
      .where(
        and(
          eq(aiProviders.id, input.id),
          eq(aiProviders.userId, ctx.user.id),
        ),
      )
      .returning({ id: aiProviders.id });

    return result[0] ?? null;
  });
