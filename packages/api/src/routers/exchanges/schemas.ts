import { EXCHANGE_TYPES, EXCHANGE_VISIBILITIES } from "@DCRM/domain";
import { z } from "zod";

import { jsonObjectSchema } from "../../crm/custom-fields.js";

export const exchangeFieldsSchema = z.object({
  clientId: z.string().trim().min(1).nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  ticketId: z.string().trim().min(1).nullable().optional(),
  type: z.enum(EXCHANGE_TYPES),
  visibility: z.enum(EXCHANGE_VISIBILITIES).optional(),
  subject: z.string().nullable().optional(),
  body: z.string().trim().min(1),
  occurredAt: z.coerce.date().optional(),
  externalMessageId: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  metadata: jsonObjectSchema.optional(),
});

export const exchangeUpdateFieldsSchema = exchangeFieldsSchema.partial().extend({
  id: z.string().trim().min(1),
});

export const exchangeIdSchema = z.object({ id: z.string().trim().min(1) });

export const timelineSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  ticketId: z.string().trim().min(1).optional(),
  includeDeleted: z.boolean().optional(),
});

export const ticketCommentSchema = z.object({
  ticketId: z.string().trim().min(1),
  body: z.string().trim().min(1),
  visibility: z.enum(EXCHANGE_VISIBILITIES).optional(),
  emailToClient: z.boolean().optional(),
  emailAccountId: z.string().trim().min(1).optional(),
  occurredAt: z.coerce.date().optional(),
  metadata: jsonObjectSchema.optional(),
});
