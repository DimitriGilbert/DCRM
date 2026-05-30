import { db } from "@DCRM/db";
import { entityTags, tags } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { attachTagSchema } from "./schemas";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

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

    try {
      await db.insert(entityTags).values(row);
      return row;
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

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

      return existing ?? row;
    }
  });
