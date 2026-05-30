import { ATTACHMENT_TARGET_TYPES } from "@DCRM/domain";
import { z } from "zod";

export const attachmentTargetSchema = z.object({
  targetType: z.enum(ATTACHMENT_TARGET_TYPES),
  targetId: z.string().trim().min(1),
});

export const createAttachmentSchema = attachmentTargetSchema.extend({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255).optional(),
  byteSize: z.number().int().positive(),
  checksum: z.string().trim().min(1).max(255).optional(),
  contentBase64: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
