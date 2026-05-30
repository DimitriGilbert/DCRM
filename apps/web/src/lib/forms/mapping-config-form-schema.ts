import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const mappingFieldSchema = z.object({
  sourcePath: z.string().min(1, "Source path is required"),
  targetField: z.string().min(1, "Target field is required"),
  defaultValue: z.string().optional(),
  coerce: z.enum(["none", "string", "number", "boolean"]).optional(),
});

const mappingConfigSchema = z.object({
  eventType: z.string().min(1, "Event type is required"),
  fields: z.array(mappingFieldSchema).min(1, "At least one field mapping is required"),
  staticPayload: z.string().optional().refine((v) => {
    if (!v || v.trim() === "") return true;
    try {
      JSON.parse(v);
      return true;
    } catch {
      return false;
    }
  }, "Invalid JSON"),
});

type MappingFieldValues = z.infer<typeof mappingFieldSchema>;
type MappingConfigValues = z.infer<typeof mappingConfigSchema>;

const mappingFieldEditorFields: readonly FormedibleFieldConfig<MappingFieldValues>[] = [
  {
    name: "sourcePath",
    type: "text",
    label: "Source JSON Path",
    placeholder: "data.user.email",
    required: true,
  },
  {
    name: "targetField",
    type: "text",
    label: "Target Field",
    placeholder: "sender",
    required: true,
  },
  {
    name: "defaultValue",
    type: "text",
    label: "Default Value",
    placeholder: "Leave empty if required",
  },
  {
    name: "coerce",
    type: "select",
    label: "Type Coercion",
    options: [
      { label: "None", value: "none" },
      { label: "String", value: "string" },
      { label: "Number", value: "number" },
      { label: "Boolean", value: "boolean" },
    ],
  },
];

const mappingConfigEditorFields: readonly FormedibleFieldConfig<MappingConfigValues>[] = [
  {
    name: "eventType",
    type: "select",
    label: "Target Event Type",
    required: true,
    options: [
      { label: "Exchange Created", value: "exchange.created" },
      { label: "Client Created", value: "client.created" },
      { label: "Ticket Created", value: "ticket.created" },
      { label: "Ticket Comment Added", value: "ticket.comment_added" },
      { label: "Lead Created", value: "lead.created" },
      { label: "Project Created", value: "project.created" },
      { label: "Webhook Received", value: "webhook.received" },
    ],
  },
  {
    name: "staticPayload",
    type: "textarea",
    label: "Static Payload (JSON)",
    placeholder: '{"source": "stripe"}',
    section: "Advanced",
  },
];

export {
  mappingFieldSchema,
  mappingConfigSchema,
  mappingFieldEditorFields,
  mappingConfigEditorFields,
};
export type { MappingFieldValues, MappingConfigValues };
