import { TRPCError } from "@trpc/server";
import { db } from "@DCRM/db";
import { hooks } from "@DCRM/db/schema/automation";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { deleteHookSchema } from "./schemas";

export const deleteHook = protectedProcedure
  .input(deleteHookSchema)
  .mutation(async ({ ctx, input }) => {
    const result = await db
      .delete(hooks)
      .where(
        and(
          eq(hooks.id, input.id),
          eq(hooks.userId, ctx.user.id),
        ),
      )
      .returning({ id: hooks.id });

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Hook not found" });
    }

    return { id: input.id };
  });
