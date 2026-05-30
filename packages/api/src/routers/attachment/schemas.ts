import { z } from "zod";

import { attachmentEntityTypeSchema } from "@DCRM/domain";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const uploadAttachmentSchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  mimeType: z.string().min(1),
});

export type UploadAttachmentInput = z.infer<typeof uploadAttachmentSchema>;

export const attachmentIdSchema = z.object({
  id: z.string().min(1),
});

export type AttachmentIdInput = z.infer<typeof attachmentIdSchema>;

export const listAttachmentsSchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().min(1),
});

export type ListAttachmentsInput = z.infer<typeof listAttachmentsSchema>;

export const downloadAttachmentSchema = z.object({
  id: z.string().min(1),
});

export type DownloadAttachmentInput = z.infer<typeof downloadAttachmentSchema>;
