import { z } from "zod";

import { exchangeTypeSchema } from "@DCRM/domain";

export const createExchangeSchema = z.object({
  type: exchangeTypeSchema,
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  ticketId: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  direction: z.enum(["incoming", "outgoing"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isInternal: z.boolean().optional(),
});

export type CreateExchangeInput = z.infer<typeof createExchangeSchema>;

export const exchangeIdSchema = z.object({
  id: z.string().min(1),
});

export type ExchangeIdInput = z.infer<typeof exchangeIdSchema>;

export const listExchangesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  ticketId: z.string().optional(),
  type: exchangeTypeSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListExchangesInput = z.infer<typeof listExchangesSchema>;

export const timelineSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  ticketId: z.string().optional(),
});

export type TimelineInput = z.infer<typeof timelineSchema>;
