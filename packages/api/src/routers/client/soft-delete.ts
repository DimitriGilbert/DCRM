import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { clientIdSchema } from "./schemas";

export const softDeleteClient = protectedProcedure
  .input(clientIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, input.id),
          eq(clients.userId, ctx.user.id),
          isNull(clients.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const now = new Date();
    const [updated] = await db
      .update(clients)
      .set({ deletedAt: now })
      .where(eq(clients.id, input.id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.CLIENT_DELETED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "client", id: input.id },
        payload: { deletedAt: now.toISOString() },
      },
    );

    return updated ?? null;
  });
