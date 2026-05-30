import { db } from "@DCRM/db";
import { projects } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNotNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { projectIdSchema } from "./schemas";

export const restoreProject = protectedProcedure
  .input(projectIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.userId, ctx.user.id),
          isNotNull(projects.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const [updated] = await db
      .update(projects)
      .set({ deletedAt: null })
      .where(eq(projects.id, input.id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.PROJECT_RESTORED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "project", id: input.id },
        payload: {},
      },
    );

    return updated ?? null;
  });
