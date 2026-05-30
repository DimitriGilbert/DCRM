import { z } from "zod";

import {
  ticketTypeSchema,
  ticketStatusSchema,
  ticketPrioritySchema,
} from "@DCRM/domain";

export const createTicketSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  type: ticketTypeSchema.optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  dueDate: z.string().datetime().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  type: ticketTypeSchema.optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const ticketIdSchema = z.object({
  id: z.string().min(1),
});

export type TicketIdInput = z.infer<typeof ticketIdSchema>;

export const listTicketsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  projectId: z.string().optional(),
  status: ticketStatusSchema.optional(),
  type: ticketTypeSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type ListTicketsInput = z.infer<typeof listTicketsSchema>;

export const searchTicketsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(50),
});

export type SearchTicketsInput = z.infer<typeof searchTicketsSchema>;
