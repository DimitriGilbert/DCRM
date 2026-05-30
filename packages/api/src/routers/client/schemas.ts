import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
  address: z.record(z.string(), z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  socialLinks: z.record(z.string(), z.string()).nullable().optional(),
  address: z.record(z.string(), z.string()).nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const clientIdSchema = z.object({
  id: z.string().min(1),
});

export type ClientIdInput = z.infer<typeof clientIdSchema>;

export const listClientsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type ListClientsInput = z.infer<typeof listClientsSchema>;

export const searchClientsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(50),
});

export type SearchClientsInput = z.infer<typeof searchClientsSchema>;
