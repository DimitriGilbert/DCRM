import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

const aiProviderTypes = ["openrouter", "openai", "anthropic", "google"] as const;

export const aiProviderFormSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(aiProviderTypes),
  apiKey: z.string().trim().min(1),
  baseUrl: z.url().optional().or(z.literal("")),
  defaultModel: z.string().trim().min(1),
  enabled: z.boolean(),
});

export type AiProviderFormValues = Record<string, unknown> & z.infer<typeof aiProviderFormSchema>;

const providerTypeOptions = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI / compatible" },
  { value: "anthropic", label: "Anthropic / compatible" },
  { value: "google", label: "Google Gemini" },
] satisfies readonly { readonly value: AiProviderFormValues["type"]; readonly label: string }[];

export function AiProviderForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: AiProviderFormValues) => Promise<void> }) {
  const fields = [
    { name: "name", type: "text", label: "Provider name", description: "A private label for this BYOK provider." },
    { name: "type", type: "select", label: "Provider", options: providerTypeOptions },
    { name: "apiKey", type: "password", label: "API key", description: "Encrypted at rest and never shown again." },
    { name: "baseUrl", type: "text", label: "Custom base URL", description: "Optional for OpenAI-compatible or Anthropic-compatible APIs." },
    { name: "defaultModel", type: "text", label: "Default model" },
    { name: "enabled", type: "switch", label: "Enabled" },
  ] satisfies readonly FormedibleFieldConfig<AiProviderFormValues>[];

  const { Form } = useFormedible<AiProviderFormValues>({
    schema: aiProviderFormSchema,
    fields,
    formOptions: {
      defaultValues: {
        name: "",
        type: "openrouter" as const,
        apiKey: "",
        baseUrl: "",
        defaultModel: "openai/gpt-5.1",
        enabled: true,
      },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Save provider",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}
