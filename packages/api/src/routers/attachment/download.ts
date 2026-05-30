import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { getStorageBackend } from "../../storage";
import { downloadAttachmentSchema } from "./schemas";

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

    const backend = getStorageBackend();
    const data = await backend.get(ctx.user.id, row.filePath);

    return {
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.fileSize,
      data,
    };
  });
