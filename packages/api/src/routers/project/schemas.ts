import { z } from "zod";

import { projectStatusSchema } from "@DCRM/domain";

export const createProjectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().min(1),
  description: z.string().optional(),
  status: projectStatusSchema.optional(),
  budgetAmount: z.number().optional(),
  budgetCurrency: z.string().optional(),
  estimatedHours: z.number().optional(),
  actualHours: z.number().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: projectStatusSchema.optional(),
  budgetAmount: z.number().nullable().optional(),
  budgetCurrency: z.string().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  actualHours: z.number().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectIdSchema = z.object({
  id: z.string().min(1),
});

export type ProjectIdInput = z.infer<typeof projectIdSchema>;

export const listProjectsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  clientId: z.string().optional(),
  status: projectStatusSchema.optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListProjectsInput = z.infer<typeof listProjectsSchema>;

export const updateProjectStatusSchema = z.object({
  id: z.string().min(1),
  status: projectStatusSchema,
});

export type UpdateProjectStatusInput = z.infer<typeof updateProjectStatusSchema>;

export const searchProjectsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(50),
});

export type SearchProjectsInput = z.infer<typeof searchProjectsSchema>;
