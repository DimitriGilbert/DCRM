import { z } from "zod";

export const listNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const createNotificationSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().optional(),
  type: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const notificationIdSchema = z.object({
  id: z.string().trim().min(1),
});
