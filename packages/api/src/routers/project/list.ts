import { db } from "@DCRM/db";
import { projects } from "@DCRM/db/schema/crm";
import { eq, and, isNull, lt, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listProjectsSchema } from "./schemas";

export const listProjects = protectedProcedure
  .input(listProjectsSchema)
  .query(async ({ ctx, input }) => {
    const conditions = [eq(projects.userId, ctx.user.id)];

    if (!input.includeDeleted) {
      conditions.push(isNull(projects.deletedAt));
    }

    if (input.clientId) {
      conditions.push(eq(projects.clientId, input.clientId));
    }

    if (input.status) {
      conditions.push(eq(projects.status, input.status));
    }

    if (input.cursor) {
      conditions.push(lt(projects.createdAt, new Date(input.cursor)));
    }

    const rows = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt?.toISOString() ?? undefined
      : undefined;

    return { items, nextCursor };
  });
