import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { listAttachmentsSchema } from "./schemas";

/**
 * List attachments for a given entity.
 * Results are scoped to the authenticated user.
 */
export const listAttachments = protectedProcedure
  .input(listAttachmentsSchema)
  .query(async ({ ctx, input }) => {
    const rows = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.userId, ctx.user.id),
          eq(attachments.entityType, input.entityType),
          eq(attachments.entityId, input.entityId),
        ),
      );

    return { items: rows };
  });
