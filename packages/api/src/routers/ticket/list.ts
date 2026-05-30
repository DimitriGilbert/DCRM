import { db } from "@DCRM/db";
import { tickets } from "@DCRM/db/schema/crm";
import { eq, and, isNull, lt, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listTicketsSchema } from "./schemas";

export const listTickets = protectedProcedure
  .input(listTicketsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(tickets.userId, ctx.user.id)];

    if (!input.includeDeleted) {
      conditions.push(isNull(tickets.deletedAt));
    }

    if (input.projectId) {
      conditions.push(eq(tickets.projectId, input.projectId));
    }

    if (input.status) {
      conditions.push(eq(tickets.status, input.status));
    }

    if (input.type) {
      conditions.push(eq(tickets.type, input.type));
    }

    if (input.priority) {
      conditions.push(eq(tickets.priority, input.priority));
    }

    if (input.cursor) {
      conditions.push(lt(tickets.createdAt, new Date(input.cursor)));
    }

    const rows = await db
      .select()
      .from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
      : undefined;

    return { items, nextCursor };
  });
