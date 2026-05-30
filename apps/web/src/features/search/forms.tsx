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
});

export type GlobalSearchFormValues = Record<string, unknown> & z.infer<typeof globalSearchFormSchema>;

export type GlobalSearchFilters = {
  readonly search?: string;
  readonly entityTypes?: readonly Exclude<(typeof SEARCH_ENTITY_TYPES)[number], "all">[];
  readonly status?: Exclude<(typeof SEARCH_STATUSES)[number], "all">;
  readonly tagIds?: readonly string[];
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
    dateFrom: values.dateFrom ? new Date(values.dateFrom) : undefined,
    dateTo: values.dateTo ? new Date(values.dateTo) : undefined,
  };
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^\w/u, (character) => character.toUpperCase());
}
