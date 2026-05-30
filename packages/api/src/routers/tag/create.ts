import { db } from "@DCRM/db";
import { tags } from "@DCRM/db/schema/crm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createTagSchema } from "./schemas";

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

    await db.insert(tags).values(row);

    return row;
  });
