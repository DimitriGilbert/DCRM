import { z } from "zod";

import { attachmentEntityTypeSchema } from "@DCRM/domain";

export const attachTagSchema = z.object({
  tagId: z.string().min(1),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().min(1),
});

export type AttachTagInput = z.infer<typeof attachTagSchema>;

export const detachTagSchema = z.object({
  tagId: z.string().min(1),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().min(1),
});

export type DetachTagInput = z.infer<typeof detachTagSchema>;
