import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { eq, and, isNull, lt, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listClientsSchema } from "./schemas";

export const listClients = protectedProcedure
  .input(listClientsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(clients.userId, ctx.user.id)];

    if (!input.includeDeleted) {
      conditions.push(isNull(clients.deletedAt));
    }

    if (input.cursor) {
      conditions.push(lt(clients.createdAt, new Date(input.cursor)));
    }

    const rows = await db
      .select()
      .from(clients)
      .where(and(...conditions))
      .orderBy(desc(clients.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
      : undefined;

    return { items, nextCursor };
  });
