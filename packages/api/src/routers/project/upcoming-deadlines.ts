import { db } from "@DCRM/db";
import { projects } from "@DCRM/db/schema/crm";
import { eq, and, isNull, isNotNull, gte, asc, inArray } from "drizzle-orm";

import { protectedProcedure } from "../../index";

export const upcomingProjectDeadlines = protectedProcedure
  .query(async ({ ctx }) => {
    const now = new Date();

    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        endDate: projects.endDate,
        status: projects.status,
      })
      .from(projects)
      .where(
        and(
          eq(projects.userId, ctx.user.id),
          isNull(projects.deletedAt),
          inArray(projects.status, ["planning", "active", "on_hold"]),
          isNotNull(projects.endDate),
          gte(projects.endDate, now),
        ),
      )
      .orderBy(asc(projects.endDate))
      .limit(10);

    return rows;
  });
