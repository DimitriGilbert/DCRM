import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const ticketFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.enum(["task", "bug", "feature", "question"]).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().optional(),
});

type TicketFormValues = z.infer<typeof ticketFormSchema>;

const ticketFormFields: readonly FormedibleFieldConfig<TicketFormValues>[] = [
  {
    name: "title",
    type: "text",
    label: "Title",
    placeholder: "Fix login redirect bug",
    required: true,
    section: "Details",
  },
  {
    name: "description",
    type: "textarea",
    label: "Description",
    placeholder: "Describe the issue or task...",
    textareaConfig: { rows: 4, maxLength: 5000 },
  },
  {
    name: "type",
    type: "select",
    label: "Type",
    options: [
      { value: "task", label: "Task" },
      { value: "bug", label: "Bug" },
      { value: "feature", label: "Feature" },
      { value: "question", label: "Question" },
    ],
    section: "Classification",
  },
  {
    name: "status",
    type: "select",
    label: "Status",
    options: [
      { value: "open", label: "Open" },
      { value: "in_progress", label: "In Progress" },
      { value: "resolved", label: "Resolved" },
      { value: "closed", label: "Closed" },
    ],
  },
  {
    name: "priority",
    type: "select",
    label: "Priority",
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "urgent", label: "Urgent" },
    ],
  },
  {
    name: "dueDate",
    type: "date",
    label: "Due Date",
    section: "Schedule",
  },
];

const ticketFormDefaultValues: TicketFormValues = {
  title: "",
  description: "",
  type: "task" as const,
  status: "open" as const,
  priority: "medium" as const,
  dueDate: "",
};

export { ticketFormSchema, ticketFormFields, ticketFormDefaultValues };
export type { TicketFormValues };
