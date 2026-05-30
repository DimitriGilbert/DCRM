import { z } from "zod";

// --- Entity type discriminator ---

export const SEARCH_ENTITY_TYPES = [
  "client",
  "lead",
  "project",
  "ticket",
  "exchange",
] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export const searchEntityTypeSchema = z.enum(SEARCH_ENTITY_TYPES);

// --- Global search ---

export const globalSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(20),
  entityTypes: z.array(searchEntityTypeSchema).optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;

// --- Per-entity filter schemas for list endpoints ---

export const clientListFiltersSchema = z.object({
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ClientListFilters = z.infer<typeof clientListFiltersSchema>;

export const leadListFiltersSchema = z.object({
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type LeadListFilters = z.infer<typeof leadListFiltersSchema>;

export const projectListFiltersSchema = z.object({
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ProjectListFilters = z.infer<typeof projectListFiltersSchema>;

export const ticketListFiltersSchema = z.object({
  tagIds: z.array(z.string().min(1)).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type TicketListFilters = z.infer<typeof ticketListFiltersSchema>;

export const exchangeListFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ExchangeListFilters = z.infer<typeof exchangeListFiltersSchema>;

// --- Search result item ---

export interface SearchResultItem {
  id: string;
  entityType: SearchEntityType;
  label: string;
  sublabel: string | null;
  status: string | null;
  createdAt: Date;
  /** For entities that belong to a parent (e.g. ticket → project, exchange → client). */
  parentId: string | null;
  parentType: "client" | "project" | "ticket" | null;
}

// --- Schema validation tests are in schemas.test.ts ---
