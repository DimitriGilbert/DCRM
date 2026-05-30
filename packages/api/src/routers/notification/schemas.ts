import { z } from "zod";

export const listNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  unreadOnly: z.boolean().default(false),
});

export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;

export const markReadSchema = z.object({
  id: z.string().min(1),
});

export type MarkReadInput = z.infer<typeof markReadSchema>;

export const markAllReadSchema = z.object({});

export type MarkAllReadInput = z.infer<typeof markAllReadSchema>;
