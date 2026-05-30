import { TRPCError } from "@trpc/server";

import { AttachmentTargetNotFoundError } from "../../crm/repository.js";
import { protectedProcedure } from "../../index.js";
import { assertAttachmentTarget, assertAttachmentUploadBounds, decodeAttachmentContent, requireStorage, safeStorageFileName } from "./helpers.js";
import { createAttachmentSchema } from "./schemas.js";

export const createAttachment = protectedProcedure.input(createAttachmentSchema).mutation(async ({ ctx, input }) => {
  const storage = requireStorage(ctx);
  assertAttachmentUploadBounds(input.contentBase64, input.byteSize, storage.maxAttachmentBytes);
  await assertAttachmentTarget(ctx, input.targetType, input.targetId);
  const attachmentId = crypto.randomUUID();
  const content = decodeAttachmentContent(input.contentBase64, input.byteSize);
  const storageKey = `${ctx.auth.user.id}/${attachmentId}/${safeStorageFileName(input.fileName)}`;
  const stored = await storage.service.put({ key: storageKey, content, contentType: input.contentType });
  const now = new Date();
  const attachment = await ctx.crmRepository.attachments
    .createWithinUserQuota({
      id: attachmentId,
      userId: ctx.auth.user.id,
      fields: {
        targetType: input.targetType,
        targetId: input.targetId,
        storageBackend: stored.backend,
        storageKey: stored.key,
        fileName: input.fileName,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        checksum: input.checksum,
        metadata: input.metadata,
      },
      now,
      userQuotaBytes: storage.userQuotaBytes,
    })
    .catch(async (error: unknown) => {
      await deleteStoredAttachment(storage.service, stored.key);
      if (error instanceof AttachmentTargetNotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment target not found." });
      }
      throw error;
    });

  if (!attachment) {
    await deleteStoredAttachment(storage.service, stored.key);
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Attachment would exceed the configured user storage quota." });
  }
  await ctx.eventService.emitApi({
    type: "attachment.file_attached",
    userId: ctx.auth.user.id,
    entity: { type: "attachment", id: attachment.id },
    payload: { id: attachment.id, targetType: attachment.targetType, targetId: attachment.targetId, fileName: attachment.fileName, byteSize: attachment.byteSize },
    changes: { after: { targetType: attachment.targetType, targetId: attachment.targetId, fileName: attachment.fileName, byteSize: attachment.byteSize } },
  });
  return attachment;
});

async function deleteStoredAttachment(service: ReturnType<typeof requireStorage>["service"], key: string): Promise<void> {
  try {
    await service.delete(key);
  } catch {
    return;
  }
}
