import { PROJECT_STATUSES } from "@DCRM/domain";
import { z } from "zod";

import { customFieldSchemaInputSchema, jsonObjectSchema } from "../../crm/custom-fields.js";

const budgetAmountSchema = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/u).nullable().optional();
const budgetCurrencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/u).toUpperCase().nullable().optional();
const hourAmountSchema = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/u).nullable().optional();
const dateOnlySchema = z.string().trim().refine(isStrictCalendarDate, "Use a valid calendar date.").transform(calendarDateToUtcDate);
const nullableDateOnlySchema = dateOnlySchema.nullable().optional();

export const projectFieldsSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  budgetAmount: budgetAmountSchema,
  budgetCurrency: budgetCurrencySchema,
  estimatedHours: hourAmountSchema,
  actualHours: hourAmountSchema,
  startsAt: nullableDateOnlySchema,
  dueAt: nullableDateOnlySchema,
  completedAt: nullableDateOnlySchema,
  customFields: jsonObjectSchema.optional(),
  customFieldSchema: customFieldSchemaInputSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const projectUpdateFieldsSchema = projectFieldsSchema.partial().extend({
  id: z.string().trim().min(1),
});

export const projectIdSchema = z.object({ id: z.string().trim().min(1) });

export const listProjectsSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  includeDeleted: z.boolean().optional(),
});

export const updateProjectStatusSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(PROJECT_STATUSES),
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
