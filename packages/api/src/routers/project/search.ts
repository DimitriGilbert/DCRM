import { db } from "@DCRM/db";
import { projects } from "@DCRM/db/schema/crm";
import { eq, and, isNull, or, ilike, desc } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { searchProjectsSchema } from "./schemas";

export const searchProjects = protectedProcedure
  .input(searchProjectsSchema)
  .query(async ({ ctx, input }) => {
    const pattern = `%${input.query}%`;

    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.userId, ctx.user.id),
          isNull(projects.deletedAt),
          or(
            ilike(projects.name, pattern),
            ilike(projects.description, pattern),
          ),
        ),
      )
      .orderBy(desc(projects.createdAt))
      .limit(input.limit);

    return rows;
  });
