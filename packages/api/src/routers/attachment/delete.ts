import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { getStorageBackend } from "../../storage";
import { attachmentIdSchema } from "./schemas";

export const deleteAttachment = protectedProcedure
  .input(attachmentIdSchema)
  .mutation(async ({ ctx, input }) => {
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

    if (!row) {
      return null;
    }

    await db
      .delete(attachments)
      .where(
        and(
          eq(attachments.id, input.id),
          eq(attachments.userId, ctx.user.id),
        ),
      );

    const backend = getStorageBackend();
    await backend.delete(ctx.user.id, row.filePath);

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.FILE_DETACHED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: row.entityType, id: row.entityId },
        payload: {
          attachmentId: row.id,
          fileName: row.fileName,
        },
      },
    );

    return { id: row.id };
  });
