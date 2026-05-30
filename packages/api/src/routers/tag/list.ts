import { db } from "@DCRM/db";
import { tags } from "@DCRM/db/schema/crm";
import { eq, and, desc, lt } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listTagsSchema } from "./schemas";

export const listTags = protectedProcedure
  .input(listTagsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(tags.userId, ctx.user.id)];

    if (input.cursor) {
      conditions.push(lt(tags.createdAt, new Date(input.cursor)));
    }

    const rows = await db
      .select()
      .from(tags)
      .where(and(...conditions))
      .orderBy(desc(tags.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
      : undefined;

    return { items, nextCursor };
  });
