import { z } from "zod";

import { leadStageSchema } from "@DCRM/domain";

export const createLeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  stage: leadStageSchema.optional(),
  estimatedValue: z.number().optional(),
  currency: z.string().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
  address: z.record(z.string(), z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  estimatedValue: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  socialLinks: z.record(z.string(), z.string()).nullable().optional(),
  address: z.record(z.string(), z.string()).nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const leadIdSchema = z.object({
  id: z.string().min(1),
});

export type LeadIdInput = z.infer<typeof leadIdSchema>;

export const listLeadsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  stage: leadStageSchema.optional(),
});

export type ListLeadsInput = z.infer<typeof listLeadsSchema>;

export const updateLeadStageSchema = z.object({
  id: z.string().min(1),
  stage: leadStageSchema,
});

export type UpdateLeadStageInput = z.infer<typeof updateLeadStageSchema>;

export const convertLeadSchema = z.object({
  id: z.string().min(1),
});

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

export const searchLeadsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(50),
});

export type SearchLeadsInput = z.infer<typeof searchLeadsSchema>;
