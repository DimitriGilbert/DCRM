import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import type { ReactNode } from "react";
import { z } from "zod";

import type { ClientRecord, LeadRecord } from "./types";
import { WEB_LEAD_STAGES } from "./constants";
import type { WebLeadStage } from "./constants";
import { clientFormValuesToInput, leadFormValuesToInput, objectText } from "./forms-normalization";
import type { ClientMutationInput, LeadMutationInput } from "./forms-normalization";

export const optionalEmailFormSchema = z.string().trim().refine((value) => value.length === 0 || z.email().safeParse(value).success, "Enter a valid email or leave it blank.");
export const optionalUrlFormSchema = z.string().trim().refine((value) => value.length === 0 || z.url().safeParse(value).success, "Enter a valid URL or leave it blank.");
export const optionalCurrencyFormSchema = z.string().trim().refine((value) => value.length === 0 || /^[A-Za-z]{3}$/u.test(value), "Use a 3-letter currency code.");
export const optionalMoneyFormSchema = z.string().trim().refine((value) => value.length === 0 || /^\d+(?:\.\d{1,2})?$/u.test(value), "Use a positive amount with up to 2 decimals.");

export const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Client name is required."),
  email: optionalEmailFormSchema,
  phone: z.string().trim(),
  company: z.string().trim(),
  website: optionalUrlFormSchema,
  notes: z.string().trim(),
  socialLinksText: z.string().trim(),
  addressText: z.string().trim(),
});

export const leadFormSchema = clientFormSchema.extend({
  source: z.string().trim(),
  stage: z.enum(WEB_LEAD_STAGES),
  estimatedValueAmount: optionalMoneyFormSchema,
  estimatedValueCurrency: optionalCurrencyFormSchema,
});

export const conversionFormSchema = z.object({
  confirmConversion: z.boolean().refine((value) => value, "Confirm that this won lead should become a client."),
});

export const clientFilterFormSchema = z.object({
  search: z.string().trim(),
  includeDeleted: z.boolean(),
});

export const leadFilterFormSchema = z.object({
  search: z.string().trim(),
  stage: z.enum(["all", ...WEB_LEAD_STAGES]),
  includeConverted: z.boolean(),
  includeDeleted: z.boolean(),
});

export const tagFormSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required."),
  color: z.string().trim(),
});

export type ClientFormValues = Record<string, unknown> & z.infer<typeof clientFormSchema>;
export type LeadFormValues = Record<string, unknown> & z.infer<typeof leadFormSchema>;
export type ClientFilterValues = Record<string, unknown> & z.infer<typeof clientFilterFormSchema>;
export type LeadFilterValues = Record<string, unknown> & z.infer<typeof leadFilterFormSchema>;
export type ConversionFormValues = Record<string, unknown> & z.infer<typeof conversionFormSchema>;
export type TagFormValues = Record<string, unknown> & z.infer<typeof tagFormSchema>;

export type { ClientMutationInput, LeadMutationInput } from "./forms-normalization";

const clientFields = [
  { name: "name", type: "text", label: "Name", required: true, section: { title: "Identity", description: "Core client profile fields." } },
  { name: "email", type: "email", label: "Email" },
  { name: "phone", type: "text", label: "Phone" },
  { name: "company", type: "text", label: "Company" },
  { name: "website", type: "url", label: "Website", placeholder: "https://example.com" },
  { name: "notes", type: "textarea", label: "Notes", textareaConfig: { rows: 5, maxLength: 2_000, showWordCount: true }, section: { title: "Context", description: "Useful relationship notes for timeline context." } },
  { name: "socialLinksText", type: "textarea", label: "Social links", description: "One link per line. Stored as structured profile links.", textareaConfig: { rows: 3 } },
  { name: "addressText", type: "textarea", label: "Address", description: "Postal address or general contact location text.", textareaConfig: { rows: 3 } },
] satisfies readonly FormedibleFieldConfig<ClientFormValues>[];

const leadFields = [
  ...clientFields,
  { name: "source", type: "text", label: "Source", section: { title: "Pipeline", description: "Lead-specific tracking fields." } },
  { name: "stage", type: "select", label: "Stage", options: WEB_LEAD_STAGES.map((stage) => ({ value: stage, label: formatStageLabel(stage) })), required: true },
  { name: "estimatedValueAmount", type: "text", label: "Estimated value" },
  { name: "estimatedValueCurrency", type: "text", label: "Currency", placeholder: "USD" },
] satisfies readonly FormedibleFieldConfig<LeadFormValues>[];

export function ClientForm({ client, submitLabel, submitting, onSubmit }: { readonly client?: ClientRecord; readonly submitLabel: string; readonly submitting: boolean; readonly onSubmit: (input: ClientMutationInput) => Promise<void> }) {
  const { Form } = useFormedible<ClientFormValues>({
    schema: clientFormSchema,
    fields: clientFields,
    formOptions: {
      defaultValues: clientToFormValues(client),
      onSubmit: async ({ value }) => onSubmit(clientFormValuesToInput(value)),
    },
    submitLabel,
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function LeadForm({ lead, submitLabel, submitting, onSubmit }: { readonly lead?: LeadRecord; readonly submitLabel: string; readonly submitting: boolean; readonly onSubmit: (input: LeadMutationInput) => Promise<void> }) {
  const { Form } = useFormedible<LeadFormValues>({
    schema: leadFormSchema,
    fields: leadFields,
    formOptions: {
      defaultValues: leadToFormValues(lead),
      onSubmit: async ({ value }) => onSubmit(leadFormValuesToInput(value)),
    },
    submitLabel,
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function ConversionForm({ lead, submitting, onSubmit }: { readonly lead: LeadRecord; readonly submitting: boolean; readonly onSubmit: () => Promise<void> }) {
  const { Form } = useFormedible<ConversionFormValues>({
    schema: conversionFormSchema,
    fields: [
      {
        name: "confirmConversion",
        type: "checkbox",
        label: `Convert ${lead.name} into a client`,
        description: "This preserves the lead as history and creates a new client profile from its details.",
        required: true,
      },
    ],
    formOptions: {
      defaultValues: { confirmConversion: false },
      onSubmit: async () => onSubmit(),
    },
    submitLabel: "Convert lead",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function ClientFilterForm({ onSubmit }: { readonly onSubmit: (values: ClientFilterValues) => void }) {
  const { Form } = useFormedible<ClientFilterValues>({
    schema: clientFilterFormSchema,
    fields: [
      { name: "search", type: "text", label: "Search", placeholder: "Name, email, company, or website" },
      { name: "includeDeleted", type: "checkbox", label: "Include deleted clients" },
    ],
    formOptions: {
      defaultValues: { search: "", includeDeleted: false },
      onSubmit: ({ value }) => onSubmit(value),
    },
    submitLabel: "Apply filters",
  });

  return <Form className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end" />;
}

export function LeadFilterForm({ onSubmit }: { readonly onSubmit: (values: LeadFilterValues) => void }) {
  const { Form } = useFormedible<LeadFilterValues>({
    schema: leadFilterFormSchema,
    fields: [
      { name: "search", type: "text", label: "Search", placeholder: "Name, email, company, source, or website" },
      { name: "stage", type: "select", label: "Stage", options: [{ value: "all", label: "All stages" }, ...WEB_LEAD_STAGES.map((stage) => ({ value: stage, label: formatStageLabel(stage) }))] },
      { name: "includeConverted", type: "checkbox", label: "Include converted" },
      { name: "includeDeleted", type: "checkbox", label: "Include deleted" },
    ],
    formOptions: {
      defaultValues: { search: "", stage: "all" as const, includeConverted: false, includeDeleted: false },
      onSubmit: ({ value }) => onSubmit(value),
    },
    submitLabel: "Apply filters",
  });

  return <Form className="grid gap-4 lg:grid-cols-[1fr_12rem_auto_auto] lg:items-end" />;
}

export function TagCreateForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: TagFormValues) => Promise<void> }) {
  const { Form } = useFormedible<TagFormValues>({
    schema: tagFormSchema,
    fields: [
      { name: "name", type: "text", label: "New tag" },
      { name: "color", type: "text", label: "Color", placeholder: "slate" },
    ],
    formOptions: {
      defaultValues: { name: "", color: "" },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Create tag",
    loading: submitting,
  });

  return <Form className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end" />;
}

export function FormShell({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function BackButton({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Button variant="outline" size="sm" render={<a href={href} />}>
      {label}
    </Button>
  );
}

function clientToFormValues(client?: ClientRecord): ClientFormValues {
  return {
    name: client?.name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    company: client?.company ?? "",
    website: client?.website ?? "",
    notes: client?.notes ?? "",
    socialLinksText: objectText(client?.socialLinks, "links"),
    addressText: objectText(client?.address, "text"),
  };
}

function leadToFormValues(lead?: LeadRecord): LeadFormValues {
  return {
    ...clientToFormValues(lead),
    source: lead?.source ?? "",
    stage: lead?.stage ?? "new",
    estimatedValueAmount: lead?.estimatedValueAmount ?? "",
    estimatedValueCurrency: lead?.estimatedValueCurrency ?? "",
  };
}

export function formatStageLabel(stage: WebLeadStage): string {
  return stage.replace("_", " ").replace(/^\w/u, (letter) => letter.toUpperCase());
}
