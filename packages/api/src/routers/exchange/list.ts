import { db } from "@DCRM/db";
import { exchanges } from "@DCRM/db/schema/crm";
import { eq, and, lt, desc, gte, lte } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listExchangesSchema } from "./schemas";

export const listExchanges = protectedProcedure
  .input(listExchangesSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(exchanges.userId, ctx.user.id)];

    if (input.clientId) {
      conditions.push(eq(exchanges.clientId, input.clientId));
    }

    if (input.projectId) {
      conditions.push(eq(exchanges.projectId, input.projectId));
    }

    if (input.ticketId) {
      conditions.push(eq(exchanges.ticketId, input.ticketId));
    }

    if (input.type) {
      conditions.push(eq(exchanges.type, input.type));
    }

    if (input.cursor) {
      conditions.push(lt(exchanges.createdAt, new Date(input.cursor)));
    }

    if (input.dateFrom) {
      conditions.push(gte(exchanges.createdAt, new Date(input.dateFrom)));
    }

    if (input.dateTo) {
      conditions.push(lte(exchanges.createdAt, new Date(input.dateTo)));
    }

    const rows = await db
      .select()
      .from(exchanges)
      .where(and(...conditions))
      .orderBy(desc(exchanges.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
      : undefined;

    return { items, nextCursor };
  });
