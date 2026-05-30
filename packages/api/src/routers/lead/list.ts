import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import { eq, and, isNull, lt, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listLeadsSchema } from "./schemas";

export const listLeads = protectedProcedure
  .input(listLeadsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(leads.userId, ctx.user.id)];

    if (!input.includeDeleted) {
      conditions.push(isNull(leads.deletedAt));
    }

    if (input.stage) {
      conditions.push(eq(leads.stage, input.stage));
    }

    if (input.cursor) {
      conditions.push(lt(leads.createdAt, new Date(input.cursor)));
    }

    const rows = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
      : undefined;

    return { items, nextCursor };
  });
