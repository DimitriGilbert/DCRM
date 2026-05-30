import { ATTACHMENT_TARGET_TYPES, EXCHANGE_TYPES, LEAD_STAGES, PROJECT_STATUSES, TICKET_STATUSES } from "@DCRM/domain";
import { z } from "zod";

export const searchableEntityTypes = ATTACHMENT_TARGET_TYPES;
export type SearchableEntityType = (typeof searchableEntityTypes)[number];

export const searchStatusFilters = [...LEAD_STAGES, ...PROJECT_STATUSES, ...TICKET_STATUSES] as const;

export const globalSearchSchema = z.object({
  search: z.string().trim().optional(),
  entityTypes: z.array(z.enum(searchableEntityTypes)).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  status: z.enum(searchStatusFilters).optional(),
  exchangeType: z.enum(EXCHANGE_TYPES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;

export type GlobalSearchResult = {
  readonly entityType: SearchableEntityType;
  readonly entityId: string;
  readonly title: string;
  readonly description: string | null;
  readonly href: string;
  readonly status: string | null;
  readonly matchedAt: Date;
};
