import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const clientFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormValues = z.infer<typeof clientFormSchema>;

const clientFormFields: readonly FormedibleFieldConfig<ClientFormValues>[] = [
  {
    name: "name",
    type: "text",
    label: "Name",
    placeholder: "Full name",
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
    name: "notes",
    type: "textarea",
    label: "Notes",
    placeholder: "Additional notes...",
    textareaConfig: { rows: 4, maxLength: 2000 },
    section: "Additional",
  },
];

const clientFormDefaultValues: ClientFormValues = {
  name: "",
  email: "",
  phone: "",
  company: "",
  website: "",
  notes: "",
};

export { clientFormSchema, clientFormFields, clientFormDefaultValues };
export type { ClientFormValues };
