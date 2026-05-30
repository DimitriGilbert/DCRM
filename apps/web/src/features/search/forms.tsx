import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

const SEARCH_ENTITY_TYPES = ["all", "client", "lead", "project", "ticket", "exchange"] as const;
const SEARCH_STATUSES = ["all", "new", "contacted", "qualified", "proposal", "won", "lost", "planning", "active", "on_hold", "completed", "archived", "open", "closed"] as const;

export const globalSearchFormSchema = z.object({
  search: z.string().trim(),
  entityType: z.enum(SEARCH_ENTITY_TYPES),
  status: z.enum(SEARCH_STATUSES),
  tagIdsText: z.string().trim(),
  dateFrom: z.string().trim(),
  dateTo: z.string().trim(),
}).superRefine((values, context) => {
  if (!hasBoundedFormSearch(values)) {
    context.addIssue({ code: "custom", message: "Enter a search term or add a status, tag, or date filter before searching." });
  }
});

export type GlobalSearchFormValues = Record<string, unknown> & z.infer<typeof globalSearchFormSchema>;

export type GlobalSearchFilters = {
  readonly search?: string;
  readonly entityTypes?: Exclude<(typeof SEARCH_ENTITY_TYPES)[number], "all">[];
  readonly status?: Exclude<(typeof SEARCH_STATUSES)[number], "all">;
  readonly tagIds?: string[];
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
};

const searchFields = [
  { name: "search", type: "text", label: "Search", placeholder: "Client, lead, project, ticket, or exchange text" },
  { name: "entityType", type: "select", label: "Entity", options: SEARCH_ENTITY_TYPES.map((value) => ({ value, label: formatLabel(value) })) },
  { name: "status", type: "select", label: "Status", options: SEARCH_STATUSES.map((value) => ({ value, label: formatLabel(value) })) },
  { name: "tagIdsText", type: "text", label: "Tag IDs", placeholder: "tag_1, tag_2" },
  { name: "dateFrom", type: "date", label: "From" },
  { name: "dateTo", type: "date", label: "To" },
] satisfies readonly FormedibleFieldConfig<GlobalSearchFormValues>[];

export function GlobalSearchForm({ onSubmit }: { readonly onSubmit: (filters: GlobalSearchFilters) => void }) {
  const { Form } = useFormedible<GlobalSearchFormValues>({
    schema: globalSearchFormSchema,
    fields: searchFields,
    formOptions: {
      defaultValues: { search: "", entityType: "all" as const, status: "all" as const, tagIdsText: "", dateFrom: "", dateTo: "" },
      onSubmit: ({ value }) => onSubmit(formValuesToFilters(value)),
    },
    submitLabel: "Search",
  });

  return <Form className="grid gap-4 xl:grid-cols-[1fr_10rem_10rem_12rem_10rem_10rem_auto] xl:items-end" />;
}

function formValuesToFilters(values: GlobalSearchFormValues): GlobalSearchFilters {
  const tagIds = values.tagIdsText
    .split(",")
    .map((tagId) => tagId.trim())
    .filter((tagId) => tagId.length > 0);

  return {
    search: values.search || undefined,
    entityTypes: values.entityType === "all" ? undefined : [values.entityType],
    status: values.status === "all" ? undefined : values.status,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    dateFrom: values.dateFrom ? localStartOfDay(values.dateFrom) : undefined,
    dateTo: values.dateTo ? localEndOfDay(values.dateTo) : undefined,
  };
}

export function hasValidGlobalSearchFilters(filters: GlobalSearchFilters): boolean {
  return Boolean(
    (filters.search?.trim().length ?? 0) > 0
      || (filters.tagIds?.length ?? 0) > 0
      || filters.status !== undefined
      || filters.dateFrom !== undefined
      || filters.dateTo !== undefined,
  );
}

function hasBoundedFormSearch(values: GlobalSearchFormValues): boolean {
  return values.search.length > 0 || values.status !== "all" || values.tagIdsText.split(",").some((tagId) => tagId.trim().length > 0) || values.dateFrom.length > 0 || values.dateTo.length > 0;
}

function localStartOfDay(value: string): Date {
  const [year, month, day] = dateParts(value);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function localEndOfDay(value: string): Date {
  const [year, month, day] = dateParts(value);
  const date = new Date(year, month - 1, day);
  date.setHours(23, 59, 59, 999);
  return date;
}

function dateParts(value: string): readonly [number, number, number] {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined || !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new TypeError("Search date filters must use YYYY-MM-DD values.");
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new TypeError("Search date filters must be valid calendar dates.");
  }
  return [year, month, day];
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^\w/u, (character) => character.toUpperCase());
}
