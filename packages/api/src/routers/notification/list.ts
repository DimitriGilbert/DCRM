import { db } from "@DCRM/db";
import { notifications } from "@DCRM/db/schema/automation";
import { eq, and, desc, lt } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listNotificationsSchema } from "./schemas";

export const listNotifications = protectedProcedure
  .input(listNotificationsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(notifications.userId, ctx.user.id)];

    if (input.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    if (input.cursor) {
      conditions.push(lt(notifications.createdAt, new Date(input.cursor)));
    }

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
      : undefined;

    return { items, nextCursor };
  });
