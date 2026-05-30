import { z } from "zod";

export const attachTagSchema = z.object({
  tagId: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

export type AttachTagInput = z.infer<typeof attachTagSchema>;

export const detachTagSchema = z.object({
  tagId: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

export type DetachTagInput = z.infer<typeof detachTagSchema>;
