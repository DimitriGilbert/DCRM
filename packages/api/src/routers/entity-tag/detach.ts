import { db } from "@DCRM/db";
import { entityTags } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { detachTagSchema } from "./schemas";

export const detachTag = protectedProcedure
  .input(detachTagSchema)
  .mutation(async ({ input }) => {
    const [existing] = await db
      .select()
      .from(entityTags)
      .where(
        and(
          eq(entityTags.tagId, input.tagId),
          eq(entityTags.entityType, input.entityType),
          eq(entityTags.entityId, input.entityId),
        ),
      )
      .limit(1);

    if (!existing) {
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
