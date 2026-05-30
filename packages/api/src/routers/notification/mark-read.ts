import { db } from "@DCRM/db";
import { notifications } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { markReadSchema } from "./schemas";

export const markRead = protectedProcedure
  .input(markReadSchema)
  .mutation(async ({ ctx, input }) => {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, input.id),
          eq(notifications.userId, ctx.user.id),
        ),
      )
      .returning();

    return result[0] ?? null;
  });
