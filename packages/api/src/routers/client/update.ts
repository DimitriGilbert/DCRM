import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateClientSchema } from "./schemas";

export const updateClient = protectedProcedure
  .input(updateClientSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;

    const [existing] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, id),
          eq(clients.userId, ctx.user.id),
          isNull(clients.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    const [updated] = await db
      .update(clients)
      .set(updates)
      .where(eq(clients.id, id))
      .returning();

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.CLIENT_UPDATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "client", id },
        payload: updates,
        changes: {
          before: existing,
          after: updated,
        },
      },
    );

    return updated ?? null;
  });
