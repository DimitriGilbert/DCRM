import { ATTACHMENT_TARGET_TYPES, EXCHANGE_TYPES, LEAD_STAGES, PROJECT_STATUSES, TICKET_STATUSES } from "@DCRM/domain";
import { z } from "zod";

export const searchableEntityTypes = ATTACHMENT_TARGET_TYPES;
export type SearchableEntityType = (typeof searchableEntityTypes)[number];

export const searchStatusFilters = [...LEAD_STAGES, ...PROJECT_STATUSES, ...TICKET_STATUSES] as const;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/u;
const dateFromSchema = z.preprocess((value) => (typeof value === "string" && dateOnlyPattern.test(value) ? dateOnlyBoundary(value, "start") : value), z.coerce.date());
const dateToSchema = z.preprocess((value) => (typeof value === "string" && dateOnlyPattern.test(value) ? dateOnlyBoundary(value, "end") : value), z.coerce.date());

export const globalSearchSchema = z.object({
  search: z.string().trim().optional(),
  entityTypes: z.array(z.enum(searchableEntityTypes)).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  status: z.enum(searchStatusFilters).optional(),
  exchangeType: z.enum(EXCHANGE_TYPES).optional(),
  dateFrom: dateFromSchema.optional(),
  dateTo: dateToSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).superRefine((input, context) => {
  const hasSearch = input.search !== undefined && input.search.length > 0;
  const hasBoundedFilter = (input.tagIds?.length ?? 0) > 0 || input.status !== undefined || input.exchangeType !== undefined || input.dateFrom !== undefined || input.dateTo !== undefined;
  if (!hasSearch && !hasBoundedFilter) {
    context.addIssue({ code: "custom", message: "Global search requires a non-empty search term or a bounded filter." });
  }
  if (input.exchangeType !== undefined && input.entityTypes !== undefined && !input.entityTypes.includes("exchange")) {
    context.addIssue({ code: "custom", message: "exchangeType can only be used when exchange results are included." });
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

function dateOnlyBoundary(value: string, boundary: "start" | "end"): Date {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined) {
    return new Date(Number.NaN);
  }
  const date = boundary === "start" ? new Date(year, month - 1, day, 0, 0, 0, 0) : new Date(year, month - 1, day, 23, 59, 59, 999);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : new Date(Number.NaN);
}
