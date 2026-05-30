import { db } from "@DCRM/db";
import { projects } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { projectIdSchema } from "./schemas";

export const softDeleteProject = protectedProcedure
  .input(projectIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.userId, ctx.user.id),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const now = new Date();
    const [updated] = await db
      .update(projects)
      .set({ deletedAt: now })
      .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.PROJECT_DELETED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "project", id: input.id },
        payload: { deletedAt: now.toISOString() },
      },
    );

    return updated ?? null;
  });
