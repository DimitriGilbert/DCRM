import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { env } from "@DCRM/env/server";
import { createStorage } from "@DCRM/storage";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { attachmentIdSchema } from "./schemas";

/**
 * Delete an attachment by ID.
 *
 * Removes the binary from the storage backend and deletes the metadata row.
 * Scoped to the authenticated user.
 */
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

    const backend = createStorage({
      STORAGE_TYPE: env.STORAGE_TYPE,
      LOCAL_BASE_DIR: env.LOCAL_UPLOAD_DIR,
      S3_BUCKET: env.S3_BUCKET,
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_REGION: env.S3_REGION,
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    });

    await backend.delete(ctx.user.id, row.filePath);
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
