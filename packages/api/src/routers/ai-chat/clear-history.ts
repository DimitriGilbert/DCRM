import { db } from "@DCRM/db";
import { aiChatMessages } from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const clearAIHistory = protectedProcedure.mutation(async ({ ctx }) => {
  const userId = ctx.user.id;

  await db
    .delete(aiChatMessages)
    .where(eq(aiChatMessages.userId, userId));

  return { success: true };
});
