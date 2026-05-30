import { db } from "@DCRM/db";
import { notifications } from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { markAllReadSchema } from "./schemas";

export const markAllRead = protectedProcedure
  .input(markAllReadSchema)
  .mutation(async ({ ctx }) => {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, ctx.user.id))
      .returning();

    return { updated: result.length };
  });
