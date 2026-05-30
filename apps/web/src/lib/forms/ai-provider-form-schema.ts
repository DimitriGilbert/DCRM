import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const aiProviderFormSchema = z.object({
  provider: z.enum(["openrouter", "openai", "anthropic", "google"]),
  name: z.string().min(1, "Name is required"),
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().optional(),
  defaultModel: z.string().optional(),
});

type AIProviderFormValues = z.infer<typeof aiProviderFormSchema>;

const aiProviderFormFields: readonly FormedibleFieldConfig<AIProviderFormValues>[] =
  [
    {
      name: "provider",
      type: "select",
      label: "Provider",
      required: true,
      options: [
        { label: "OpenRouter", value: "openrouter" },
        { label: "OpenAI", value: "openai" },
        { label: "Anthropic", value: "anthropic" },
        { label: "Google", value: "google" },
      ],
    },
    {
      name: "name",
      type: "text",
      label: "Name",
      placeholder: "My AI Provider",
      required: true,
    },
    {
      name: "apiKey",
      type: "password",
      label: "API Key",
      placeholder: "sk-...",
      required: true,
      section: "Credentials",
    },
    {
      name: "baseUrl",
      type: "url",
      label: "Custom Base URL",
      placeholder: "https://api.example.com/v1",
    },
    {
      name: "defaultModel",
      type: "text",
      label: "Default Model",
      placeholder: "gpt-4o",
      section: "Configuration",
    },
  ];

const aiProviderFormDefaultValues: AIProviderFormValues = {
  provider: "openrouter",
  name: "",
  apiKey: "",
  baseUrl: "",
  defaultModel: "",
};

export {
  aiProviderFormSchema,
  aiProviderFormFields,
  aiProviderFormDefaultValues,
};
export type { AIProviderFormValues };
