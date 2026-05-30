import { db } from "@DCRM/db";
import { projects, entityTags } from "@DCRM/db/schema/crm";
import { eq, and, isNull, lt, desc, gte, lte, inArray } from "drizzle-orm";

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

    if (input.dateFrom) {
      conditions.push(gte(projects.createdAt, new Date(input.dateFrom)));
    }

    if (input.dateTo) {
      conditions.push(lte(projects.createdAt, new Date(input.dateTo)));
    }

    if (input.tagIds && input.tagIds.length > 0) {
      const taggedIds = await db
        .select({ entityId: entityTags.entityId })
        .from(entityTags)
        .where(
          and(
            eq(entityTags.entityType, "project"),
            inArray(entityTags.tagId, input.tagIds),
          ),
        );
      const idSet = [...new Set(taggedIds.map((r) => r.entityId))];
      if (idSet.length === 0) {
        return { items: [], nextCursor: undefined };
      }
      conditions.push(inArray(projects.id, idSet));
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
