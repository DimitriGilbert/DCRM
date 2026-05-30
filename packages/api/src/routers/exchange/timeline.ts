import { db } from "@DCRM/db";
import { exchanges } from "@DCRM/db/schema/crm";
import { eq, and, or, desc, lt, type SQL } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { timelineSchema } from "./schemas";

export const timeline = protectedProcedure
  .input(timelineSchema)
  .query(async ({ ctx, input }) => {
    const conditions: Array<SQL<unknown>> = [eq(exchanges.userId, ctx.user.id)];

    const entityFilters: Array<SQL<unknown>> = [];

    if (input.clientId) {
      entityFilters.push(eq(exchanges.clientId, input.clientId));
    }

    if (input.projectId) {
      entityFilters.push(eq(exchanges.projectId, input.projectId));
    }

    if (input.ticketId) {
      entityFilters.push(eq(exchanges.ticketId, input.ticketId));
    }

    if (entityFilters.length > 0) {
      conditions.push(or(...entityFilters) as SQL<unknown>);
    }

    if (input.cursor) {
      conditions.push(lt(exchanges.createdAt, new Date(input.cursor)));
    }

    const rows = await db
      .select()
      .from(exchanges)
      .where(and(...conditions))
      .orderBy(desc(exchanges.createdAt))
      .limit(input.limit);

    return rows;
  });
