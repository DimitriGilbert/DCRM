import { db } from "@DCRM/db";
import { tags } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateTagSchema } from "./schemas";

export const updateTag = protectedProcedure
  .input(updateTagSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;

    const [existing] = await db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.id, id),
          eq(tags.userId, ctx.user.id),
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
      .update(tags)
      .set(updates)
      .where(eq(tags.id, id))
      .returning();

    return updated ?? null;
  });
