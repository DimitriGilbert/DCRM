import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig, FormedibleFieldOption } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

const aiHookTemplates = ["summarize", "classify", "extract_contacts", "enrich_from_web"] as const;

const outputFieldSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["string", "number", "boolean", "string_array"]),
  required: z.boolean(),
});

const fieldMappingSchema = z.object({
  sourcePath: z.string().trim().min(1),
  targetField: z.string().trim().min(1),
});

export const aiHookFormSchema = z.object({
  name: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  enabled: z.boolean(),
  providerId: z.string().trim().min(1),
  model: z.string().trim().min(1),
  template: z.enum(aiHookTemplates),
  prompt: z.string().optional(),
  outputFields: z.array(outputFieldSchema).min(1),
  fieldMappings: z.array(fieldMappingSchema),
  writeBehavior: z.enum(["propose", "direct"]),
  downstreamEventBehavior: z.enum(["suppress", "emit"]),
});

export type AiHookFormValues = Record<string, unknown> & z.infer<typeof aiHookFormSchema>;

export type AiHookProviderOption = FormedibleFieldOption;

const templateOptions = [
  { value: "summarize", label: "Summarize" },
  { value: "classify", label: "Classify" },
  { value: "extract_contacts", label: "Extract contacts" },
  { value: "enrich_from_web", label: "Enrich from web" },
] satisfies readonly { readonly value: AiHookFormValues["template"]; readonly label: string }[];

const writeBehaviorOptions = [
  { value: "propose", label: "Propose first" },
  { value: "direct", label: "Write directly" },
] satisfies readonly { readonly value: AiHookFormValues["writeBehavior"]; readonly label: string }[];

const downstreamOptions = [
  { value: "suppress", label: "Suppress downstream hooks" },
  { value: "emit", label: "Emit downstream hooks" },
] satisfies readonly { readonly value: AiHookFormValues["downstreamEventBehavior"]; readonly label: string }[];

const outputTypeOptions = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "string_array", label: "Text list" },
] satisfies readonly { readonly value: AiHookFormValues["outputFields"][number]["type"]; readonly label: string }[];

export function AiHookForm({ providerOptions, submitting, onSubmit }: { readonly providerOptions: readonly AiHookProviderOption[]; readonly submitting: boolean; readonly onSubmit: (values: AiHookFormValues) => Promise<void> }) {
  const fields = [
    { name: "name", type: "text", label: "Hook name" },
    { name: "eventType", type: "text", label: "Event type", description: "For example: client.created or exchange.exchange_received." },
    { name: "enabled", type: "switch", label: "Enabled" },
    {
      name: "providerId",
      type: "select",
      label: "Provider",
      description: providerOptions.length > 0 ? "Choose an enabled BYOK provider configured above." : "Add and enable an AI provider before creating a hook.",
      placeholder: "Select a provider",
      options: providerOptions,
      disabled: providerOptions.length === 0,
    },
    { name: "model", type: "text", label: "Model" },
    { name: "template", type: "select", label: "Built-in template", options: templateOptions },
    { name: "prompt", type: "textarea", label: "Prompt override", textareaConfig: { rows: 4, showWordCount: true, maxLength: 4_000 } },
    {
      name: "outputFields",
      type: "array",
      label: "Structured output fields",
      arrayConfig: {
        itemType: "object",
        itemLabel: "Output field",
        minItems: 1,
        addButtonLabel: "Add output field",
        defaultValue: { name: "summary", type: "string", required: true },
        objectConfig: {
          fields: [
            { name: "name", type: "text", label: "Name" },
            { name: "type", type: "select", label: "Type", options: outputTypeOptions },
            { name: "required", type: "switch", label: "Required" },
          ],
        },
      },
    },
    {
      name: "fieldMappings",
      type: "array",
      label: "Field mappings",
      description: "Leave empty to store insights without proposing or writing fields.",
      arrayConfig: {
        itemType: "object",
        itemLabel: "Mapping",
        addButtonLabel: "Add mapping",
        defaultValue: { sourcePath: "summary", targetField: "notes" },
        objectConfig: {
          fields: [
            { name: "sourcePath", type: "text", label: "AI output path" },
            { name: "targetField", type: "text", label: "CRM field" },
          ],
        },
      },
    },
    { name: "writeBehavior", type: "radio", label: "Write behavior", options: writeBehaviorOptions },
    { name: "downstreamEventBehavior", type: "select", label: "Downstream hook behavior", options: downstreamOptions },
  ] satisfies readonly FormedibleFieldConfig<AiHookFormValues>[];

  const { Form } = useFormedible<AiHookFormValues>({
    schema: aiHookFormSchema,
    fields,
    formOptions: {
      defaultValues: {
        name: "Summarize new client",
        eventType: "client.created",
        enabled: true,
        providerId: "",
        model: "openai/gpt-5.1",
        template: "summarize" as const,
        prompt: "",
        outputFields: [{ name: "summary", type: "string" as const, required: true }],
        fieldMappings: [],
        writeBehavior: "propose" as const,
        downstreamEventBehavior: "suppress" as const,
      },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Save AI hook",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}
