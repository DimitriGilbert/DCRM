import { db } from "@DCRM/db";
import { aiChatMessages } from "@DCRM/db/schema/automation";
import { eq, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listMessagesSchema } from "./schemas";

export const listAIMessages = protectedProcedure
  .input(listMessagesSchema)
  .query(async ({ ctx, input }) => {
    const limit = input.limit ?? 50;
    const userId = ctx.user.id;

    const messages = await db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.userId, userId))
      .orderBy(desc(aiChatMessages.createdAt))
      .limit(limit);

    return { items: messages };
  });
