import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
});

export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const tagIdSchema = z.object({
  id: z.string().min(1),
});

export type TagIdInput = z.infer<typeof tagIdSchema>;

export const listTagsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type ListTagsInput = z.infer<typeof listTagsSchema>;
