import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

export const LEAD_STAGES = {
  NEW: "new",
  CONTACTED: "contacted",
  QUALIFIED: "qualified",
  PROPOSAL: "proposal",
  NEGOTIATION: "negotiation",
  WON: "won",
  LOST: "lost",
} as const;

export type LeadStage = (typeof LEAD_STAGES)[keyof typeof LEAD_STAGES];

const LEAD_SOURCE_OPTIONS = [
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "social-media", label: "Social Media" },
  { value: "cold-outreach", label: "Cold Outreach" },
  { value: "advertisement", label: "Advertisement" },
  { value: "other", label: "Other" },
] as const;

const leadFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  stage: z.string().optional(),
  estimatedValue: z.number().optional(),
  currency: z.string().optional(),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

interface LeadFormInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  notes?: string;
  source?: string;
  stage?: LeadStage;
  estimatedValue?: number;
  currency?: string;
}

const leadFormFields: readonly FormedibleFieldConfig<LeadFormValues>[] = [
  {
    name: "name",
    type: "text",
    label: "Name",
    placeholder: "Lead name",
    required: true,
    section: "Contact Information",
  },
  {
    name: "email",
    type: "email",
    label: "Email",
    placeholder: "email@example.com",
  },
  {
    name: "phone",
    type: "tel",
    label: "Phone",
    placeholder: "+1 (555) 000-0000",
  },
  {
    name: "company",
    type: "text",
    label: "Company",
    placeholder: "Company name",
    section: "Business Details",
  },
  {
    name: "website",
    type: "url",
    label: "Website",
    placeholder: "https://example.com",
  },
  {
    name: "source",
    type: "select",
    label: "Source",
    placeholder: "Select source",
    options: LEAD_SOURCE_OPTIONS,
    section: "Lead Details",
  },
  {
    name: "estimatedValue",
    type: "number",
    label: "Estimated Value",
    placeholder: "0.00",
    min: 0,
    step: 0.01,
  },
  {
    name: "currency",
    type: "select",
    label: "Currency",
    placeholder: "Select currency",
    options: [
      { value: "USD", label: "USD" },
      { value: "EUR", label: "EUR" },
      { value: "GBP", label: "GBP" },
      { value: "CAD", label: "CAD" },
      { value: "AUD", label: "AUD" },
    ],
  },
  {
    name: "notes",
    type: "textarea",
    label: "Notes",
    placeholder: "Additional notes...",
    textareaConfig: { rows: 4, maxLength: 2000 },
    section: "Additional",
  },
];

const leadFormDefaultValues: LeadFormValues = {
  name: "",
  email: "",
  phone: "",
  company: "",
  website: "",
  notes: "",
  source: "",
  stage: "new",
  estimatedValue: undefined,
  currency: "USD",
};

function toLeadFormInput(values: LeadFormValues): LeadFormInput {
  return {
    name: values.name,
    email: values.email || undefined,
    phone: values.phone || undefined,
    company: values.company || undefined,
    website: values.website || undefined,
    notes: values.notes || undefined,
    source: values.source || undefined,
    stage: (values.stage || undefined) as LeadStage | undefined,
    estimatedValue: values.estimatedValue ?? undefined,
    currency: values.currency || undefined,
  };
}

export {
  leadFormSchema,
  leadFormFields,
  leadFormDefaultValues,
  LEAD_SOURCE_OPTIONS,
  toLeadFormInput,
};
export type { LeadFormValues, LeadFormInput };
