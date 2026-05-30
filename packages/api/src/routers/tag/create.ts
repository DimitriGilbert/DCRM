import { db } from "@DCRM/db";
import { tags } from "@DCRM/db/schema/crm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

import { protectedProcedure } from "../../index";
import { createTagSchema } from "./schemas";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export const createTag = protectedProcedure
  .input(createTagSchema)
  .mutation(async ({ ctx, input }) => {
    const id = nanoid();
    const now = new Date();

    const row = {
      id,
      userId: ctx.user.id,
      name: input.name,
      color: input.color ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(tags).values(row);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tag with this name already exists",
        });
      }
      throw error;
    }

    return row;
  });
