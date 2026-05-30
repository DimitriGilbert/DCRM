import { db } from "@DCRM/db";
import { tags } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { tagIdSchema } from "./schemas";

export const deleteTag = protectedProcedure
  .input(tagIdSchema)
  .mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.id, input.id),
          eq(tags.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    await db.delete(tags).where(eq(tags.id, input.id));

    return { id: input.id, deleted: true };
  });
