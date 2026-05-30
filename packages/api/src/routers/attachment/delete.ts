import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { StorageError } from "@DCRM/storage";
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

    // Delete storage file first, then DB row.
    // If the file is already gone (NOT_FOUND), proceed with DB cleanup.
    // If storage delete fails for other reasons, still delete the DB row
    // to prevent orphaned metadata, but log the error.
    const backend = getStorageBackend();
    try {
      await backend.delete(ctx.user.id, row.filePath);
    } catch (err: unknown) {
      if (err instanceof StorageError && err.code === "NOT_FOUND") {
        // File already removed — safe to proceed with DB deletion.
      } else {
        console.error(
          `Storage delete failed for attachment ${row.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await db
      .delete(attachments)
      .where(
        and(
          eq(attachments.id, input.id),
          eq(attachments.userId, ctx.user.id),
        ),
      );

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
