import { db } from "@DCRM/db";
import { attachments } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { uploadAttachmentSchema } from "./schemas";

/**
 * Upload a file attachment.
 *
 * Records attachment metadata in the database. The caller receives a
 * `storageKey` and writes the actual bytes through a companion upload
 * endpoint that streams directly to the storage backend.
 */
export const uploadAttachment = protectedProcedure
  .input(uploadAttachmentSchema)
  .mutation(async ({ ctx, input }) => {
    const id = nanoid();
    const storageKey = `${input.entityType}/${input.entityId}/${id}/${input.fileName}`;

    const now = new Date();
    const row = {
      id,
      userId: ctx.user.id,
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      filePath: storageKey,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      metadata: null as Record<string, unknown> | null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(attachments).values(row);

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.FILE_ATTACHED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: input.entityType, id: input.entityId },
        payload: {
          attachmentId: id,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          storageKey,
        },
      },
    );

    return { ...row, storageKey };
  });
