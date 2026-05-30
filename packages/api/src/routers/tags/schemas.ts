import { z } from "zod";

import { jsonObjectSchema } from "../../crm/custom-fields.js";

export const tagFieldsSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().min(1).nullable().optional(),
  metadata: jsonObjectSchema.optional(),
});

export const tagUpdateSchema = tagFieldsSchema.partial().extend({ id: z.string().trim().min(1) });
export const tagIdSchema = z.object({ id: z.string().trim().min(1) });
export const listTagsSchema = z.object({ includeDeleted: z.boolean().optional() });
export const entityTagSchema = z.object({
  tagId: z.string().trim().min(1),
  entityType: z.enum(["client", "project"]),
  entityId: z.string().trim().min(1),
});
