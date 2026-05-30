import { db } from "@DCRM/db";
import { projects } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { projectIdSchema } from "./schemas";

export const readProject = protectedProcedure
  .input(projectIdSchema)
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return row;
  });
