import { PROJECT_STATUSES } from "@DCRM/domain";
import { z } from "zod";

import { customFieldSchemaInputSchema, jsonObjectSchema } from "../../crm/custom-fields.js";

export const projectFieldsSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  budgetAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/u).nullable().optional(),
  budgetCurrency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  estimatedHours: z.string().regex(/^\d+(?:\.\d{1,2})?$/u).nullable().optional(),
  actualHours: z.string().regex(/^\d+(?:\.\d{1,2})?$/u).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
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
  includeDeleted: z.boolean().optional(),
});

export const updateProjectStatusSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(PROJECT_STATUSES),
});
