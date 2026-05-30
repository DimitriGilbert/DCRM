import { LEAD_STAGES } from "@DCRM/domain";
import { z } from "zod";

import { customFieldSchemaInputSchema, jsonObjectSchema } from "../../crm/custom-fields.js";

export const leadFieldsSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email().nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  company: z.string().trim().min(1).nullable().optional(),
  website: z.url().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().trim().min(1).nullable().optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  estimatedValueAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/u).nullable().optional(),
  estimatedValueCurrency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  socialLinks: jsonObjectSchema.optional(),
  address: jsonObjectSchema.optional(),
  customFields: jsonObjectSchema.optional(),
  customFieldSchema: customFieldSchemaInputSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const leadUpdateFieldsSchema = leadFieldsSchema.partial().extend({
  id: z.string().trim().min(1),
});

export const leadIdSchema = z.object({ id: z.string().trim().min(1) });

export const listLeadsSchema = z.object({
  search: z.string().trim().optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  includeDeleted: z.boolean().optional(),
  includeConverted: z.boolean().optional(),
});

export const updateLeadStageSchema = z.object({
  id: z.string().trim().min(1),
  stage: z.enum(LEAD_STAGES),
});
