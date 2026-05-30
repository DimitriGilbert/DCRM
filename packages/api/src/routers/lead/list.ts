import { db } from "@DCRM/db";
import { leads, entityTags } from "@DCRM/db/schema/crm";
import { eq, and, isNull, lt, desc, gte, lte, inArray } from "drizzle-orm";

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

    if (input.dateFrom) {
      conditions.push(gte(leads.createdAt, new Date(input.dateFrom)));
    }

    if (input.dateTo) {
      conditions.push(lte(leads.createdAt, new Date(input.dateTo)));
    }

    if (input.tagIds && input.tagIds.length > 0) {
      const taggedIds = await db
        .select({ entityId: entityTags.entityId })
        .from(entityTags)
        .where(
          and(
            eq(entityTags.entityType, "lead"),
            inArray(entityTags.tagId, input.tagIds),
          ),
        );
      const idSet = [...new Set(taggedIds.map((r) => r.entityId))];
      if (idSet.length === 0) {
        return { items: [], nextCursor: undefined };
      }
      conditions.push(inArray(leads.id, idSet));
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
