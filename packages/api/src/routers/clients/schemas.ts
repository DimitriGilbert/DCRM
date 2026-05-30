import { z } from "zod";

import { customFieldSchemaInputSchema, jsonObjectSchema } from "../../crm/custom-fields.js";

export const clientFieldsSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email().nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  company: z.string().trim().min(1).nullable().optional(),
  website: z.url().nullable().optional(),
  notes: z.string().nullable().optional(),
  socialLinks: jsonObjectSchema.optional(),
  address: jsonObjectSchema.optional(),
  customFields: jsonObjectSchema.optional(),
  customFieldSchema: customFieldSchemaInputSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const clientUpdateFieldsSchema = clientFieldsSchema.partial().extend({
  id: z.string().trim().min(1),
});

export const clientIdSchema = z.object({ id: z.string().trim().min(1) });

export const listClientsSchema = z.object({
  search: z.string().trim().optional(),
  includeDeleted: z.boolean().optional(),
});
