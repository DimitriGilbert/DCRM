import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex color (#RRGGBB)").optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex color (#RRGGBB)").nullable().optional(),
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
