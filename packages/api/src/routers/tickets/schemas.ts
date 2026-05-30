import { TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TYPES } from "@DCRM/domain";
import { z } from "zod";

import { customFieldSchemaInputSchema, jsonObjectSchema } from "../../crm/custom-fields.js";

const dateOnlySchema = z.string().trim().refine(isStrictCalendarDate, "Use a valid calendar date.").transform(calendarDateToUtcDate);
const nullableDateOnlySchema = dateOnlySchema.nullable().optional();

export const ticketFieldsSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  type: z.enum(TICKET_TYPES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  dueAt: nullableDateOnlySchema,
  closedAt: nullableDateOnlySchema,
  customFields: jsonObjectSchema.optional(),
  customFieldSchema: customFieldSchemaInputSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const ticketUpdateFieldsSchema = ticketFieldsSchema.partial().extend({
  id: z.string().trim().min(1),
});

export const ticketIdSchema = z.object({ id: z.string().trim().min(1) });

export const getTicketSchema = ticketIdSchema.extend({ includeInactiveParent: z.boolean().optional() });

export const listTicketsSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  type: z.enum(TICKET_TYPES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  includeDeleted: z.boolean().optional(),
  includeInactiveParent: z.boolean().optional(),
});

export const updateTicketStatusSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(TICKET_STATUSES),
});

function isStrictCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function calendarDateToUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}
