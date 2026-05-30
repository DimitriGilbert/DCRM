import { db } from "@DCRM/db";
import { entityTags, tags } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { attachTagSchema } from "./schemas";

export const attachTag = protectedProcedure
  .input(attachTagSchema)
  .mutation(async ({ ctx, input }) => {
    const [tag] = await db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.id, input.tagId),
          eq(tags.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!tag) {
      return null;
    }

    const id = nanoid();
    const now = new Date();

    const row = {
      id,
      tagId: input.tagId,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: now,
    };

    await db.insert(entityTags).values(row);

    return row;
  });
