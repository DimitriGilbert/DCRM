import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

const exportEntities = ["clients", "leads", "projects", "tickets", "exchanges"] as const;
const exportFormats = ["csv", "json"] as const;

export const clientImportFormSchema = z.object({
  csv: z.string().trim().min(1, "Paste CSV content before importing."),
});

export const listExportFormSchema = z.object({
  entity: z.enum(exportEntities),
  format: z.enum(exportFormats),
});

export type ClientImportFormValues = Record<string, unknown> & z.infer<typeof clientImportFormSchema>;
export type ListExportFormValues = Record<string, unknown> & z.infer<typeof listExportFormSchema>;

const importFields = [
  {
    name: "csv",
    type: "textarea",
    label: "Client CSV",
    description: "Required header: name. Optional headers: email, phone, company, website, notes.",
    textareaConfig: { rows: 8 },
  },
] satisfies readonly FormedibleFieldConfig<ClientImportFormValues>[];

const exportFields = [
  {
    name: "entity",
    type: "select",
    label: "List",
    options: exportEntities.map((entity) => ({ value: entity, label: formatEntity(entity) })),
  },
  {
    name: "format",
    type: "select",
    label: "Format",
    options: exportFormats.map((format) => ({ value: format, label: format.toUpperCase() })),
  },
] satisfies readonly FormedibleFieldConfig<ListExportFormValues>[];

export function ClientImportForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: ClientImportFormValues) => Promise<void> }) {
  const { Form } = useFormedible<ClientImportFormValues>({
    schema: clientImportFormSchema,
    fields: importFields,
    formOptions: {
      defaultValues: { csv: "name,email,company\nAda Lovelace,ada@example.com,Analytical Engines" },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Import clients",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function ListExportForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: ListExportFormValues) => Promise<void> }) {
  const { Form } = useFormedible<ListExportFormValues>({
    schema: listExportFormSchema,
    fields: exportFields,
    formOptions: {
      defaultValues: { entity: "clients", format: "csv" },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Download export",
    loading: submitting,
  });

  return <Form className="grid gap-4 md:grid-cols-[1fr_10rem_auto] md:items-end" />;
}

function formatEntity(entity: string): string {
  return entity.slice(0, 1).toUpperCase() + entity.slice(1);
}
