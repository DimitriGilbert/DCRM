import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const projectFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  clientId: z.string().min(1, "Client is required"),
  description: z.string().optional(),
  status: z.enum(["planning", "active", "on_hold", "completed", "archived"]).optional(),
  budgetAmount: z.number().optional(),
  budgetCurrency: z.string().optional(),
  estimatedHours: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

const projectFormFields: readonly FormedibleFieldConfig<ProjectFormValues>[] = [
  {
    name: "name",
    type: "text",
    label: "Project Name",
    placeholder: "Website Redesign",
    required: true,
    section: "Details",
  },
  {
    name: "clientId",
    type: "select",
    label: "Client",
    required: true,
    placeholder: "Select a client",
    section: "Details",
  },
  {
    name: "description",
    type: "textarea",
    label: "Description",
    placeholder: "Project description...",
    textareaConfig: { rows: 3, maxLength: 3000 },
  },
  {
    name: "status",
    type: "select",
    label: "Status",
    options: [
      { value: "planning", label: "Planning" },
      { value: "active", label: "Active" },
      { value: "on_hold", label: "On Hold" },
      { value: "completed", label: "Completed" },
      { value: "archived", label: "Archived" },
    ],
    section: "Planning",
  },
  {
    name: "startDate",
    type: "date",
    label: "Start Date",
  },
  {
    name: "endDate",
    type: "date",
    label: "End Date",
  },
  {
    name: "budgetAmount",
    type: "number",
    label: "Budget Amount",
    placeholder: "0.00",
    min: 0,
    step: 0.01,
    section: "Budget & Hours",
  },
  {
    name: "budgetCurrency",
    type: "select",
    label: "Currency",
    options: [
      { value: "USD", label: "USD ($)" },
      { value: "EUR", label: "EUR (€)" },
      { value: "GBP", label: "GBP (£)" },
      { value: "CAD", label: "CAD (C$)" },
      { value: "AUD", label: "AUD (A$)" },
    ],
  },
  {
    name: "estimatedHours",
    type: "number",
    label: "Estimated Hours",
    placeholder: "0",
    min: 0,
    step: 0.5,
  },
];

const projectFormDefaultValues: ProjectFormValues = {
  name: "",
  clientId: "",
  description: "",
  status: "planning" as const,
  budgetAmount: undefined,
  budgetCurrency: "USD",
  estimatedHours: undefined,
  startDate: "",
  endDate: "",
};

export { projectFormSchema, projectFormFields, projectFormDefaultValues };
export type { ProjectFormValues };
