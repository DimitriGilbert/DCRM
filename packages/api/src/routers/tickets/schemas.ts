import { TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TYPES } from "@DCRM/domain";
import { z } from "zod";

import { customFieldSchemaInputSchema, jsonObjectSchema } from "../../crm/custom-fields.js";

export const ticketFieldsSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  type: z.enum(TICKET_TYPES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  closedAt: z.coerce.date().nullable().optional(),
  customFields: jsonObjectSchema.optional(),
  customFieldSchema: customFieldSchemaInputSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const ticketUpdateFieldsSchema = ticketFieldsSchema.partial().extend({
  id: z.string().trim().min(1),
});

export const ticketIdSchema = z.object({ id: z.string().trim().min(1) });

export const listTicketsSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  type: z.enum(TICKET_TYPES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  includeDeleted: z.boolean().optional(),
});

export const updateTicketStatusSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(TICKET_STATUSES),
});
