import { db } from "@DCRM/db";
import { entityTags, tags } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { detachTagSchema } from "./schemas";

export const detachTag = protectedProcedure
  .input(detachTagSchema)
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

    await db
      .delete(entityTags)
      .where(
        and(
          eq(entityTags.tagId, input.tagId),
          eq(entityTags.entityType, input.entityType),
          eq(entityTags.entityId, input.entityId),
        ),
      );

    return { tagId: input.tagId, entityType: input.entityType, entityId: input.entityId, detached: true };
  });
