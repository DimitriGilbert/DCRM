import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNotNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { clientIdSchema } from "./schemas";

export const restoreClient = protectedProcedure
  .input(clientIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, input.id),
          eq(clients.userId, ctx.user.id),
          isNotNull(clients.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const [updated] = await db
      .update(clients)
      .set({ deletedAt: null })
      .where(eq(clients.id, input.id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.CLIENT_RESTORED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "client", id: input.id },
        payload: {},
      },
    );

    return updated ?? null;
  });
