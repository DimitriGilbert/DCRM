import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { attachmentIdSchema } from "./schemas";

/**
 * Read a single attachment by ID, scoped to the authenticated user.
 */
export const readAttachment = protectedProcedure
  .input(attachmentIdSchema)
  .query(async ({ ctx, input }) => {
    const [row] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, input.id),
          eq(attachments.userId, ctx.user.id),
        ),
      )
      .limit(1);

    return row ?? null;
  });
