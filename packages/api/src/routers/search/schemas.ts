import { ATTACHMENT_TARGET_TYPES, EXCHANGE_TYPES, LEAD_STAGES, PROJECT_STATUSES, TICKET_STATUSES } from "@DCRM/domain";
import { z } from "zod";

export const searchableEntityTypes = ATTACHMENT_TARGET_TYPES;
export type SearchableEntityType = (typeof searchableEntityTypes)[number];

export const searchStatusFilters = [...LEAD_STAGES, ...PROJECT_STATUSES, ...TICKET_STATUSES] as const;
const dateToSchema = z.preprocess((value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T23:59:59.999`) : value), z.coerce.date());

export const globalSearchSchema = z.object({
  search: z.string().trim().optional(),
  entityTypes: z.array(z.enum(searchableEntityTypes)).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  status: z.enum(searchStatusFilters).optional(),
  exchangeType: z.enum(EXCHANGE_TYPES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: dateToSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).superRefine((input, context) => {
  const hasSearch = input.search !== undefined && input.search.length > 0;
  const hasBoundedFilter = (input.tagIds?.length ?? 0) > 0 || input.status !== undefined || input.exchangeType !== undefined || input.dateFrom !== undefined || input.dateTo !== undefined;
  if (!hasSearch && !hasBoundedFilter) {
    context.addIssue({ code: "custom", message: "Global search requires a non-empty search term or a bounded filter." });
  }
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
