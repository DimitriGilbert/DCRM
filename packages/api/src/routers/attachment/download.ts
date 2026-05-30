import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { env } from "@DCRM/env/server";
import { createStorage } from "@DCRM/storage";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { downloadAttachmentSchema } from "./schemas";

/**
 * Download an attachment by ID.
 *
 * Returns the binary bytes and content metadata for the file.
 * Scoped to the authenticated user.
 */
export const downloadAttachment = protectedProcedure
  .input(downloadAttachmentSchema)
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

    const data = await backend.get(ctx.user.id, row.filePath);

    return {
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.fileSize,
      data,
    };
  });
