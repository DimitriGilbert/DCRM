import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { deleteHookSchema } from "./schemas";

export const deleteHook = protectedProcedure
  .input(deleteHookSchema)
  .mutation(async ({ ctx, input }) => {
    await db
      .delete(hooks)
      .where(
        and(
          eq(hooks.id, input.id),
          eq(hooks.userId, ctx.user.id),
        ),
      );

    return { id: input.id };
  });
