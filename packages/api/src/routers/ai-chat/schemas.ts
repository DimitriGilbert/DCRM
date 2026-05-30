import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  providerId: z.string().min(1),
  model: z.string().optional(),
});

export const listMessagesSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
});

export const clearHistorySchema = z.void();
