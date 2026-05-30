import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

const mappingEntrySchema = z.object({
  sourcePath: z.string().trim().min(1),
  targetPath: z.string().trim().min(1),
});

export const incomingWebhookFormSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(3),
  token: z.string().optional(),
  targetEventType: z.string().trim().min(1),
  mappingConfig: z.object({ mappings: z.array(mappingEntrySchema) }),
});

export type IncomingWebhookFormValues = Record<string, unknown> & z.infer<typeof incomingWebhookFormSchema>;

export function IncomingWebhookForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: IncomingWebhookFormValues) => Promise<void> }) {
  const fields = [
    { name: "name", type: "text", label: "Webhook name" },
    { name: "slug", type: "text", label: "URL slug", description: "Used in /api/incoming-webhooks/{slug}." },
    { name: "token", type: "text", label: "Optional token", description: "Leave blank to generate a token shown once." },
    { name: "targetEventType", type: "text", label: "Target event type", description: "Incoming webhooks should normally emit webhook.webhook_received." },
    {
      name: "mappingConfig.mappings",
      type: "array",
      label: "JSON path mappings",
      description: "Map external JSON paths into the internal event payload. New webhooks start in test mode.",
      arrayConfig: {
        itemType: "object",
        itemLabel: "Mapping",
        addButtonLabel: "Add mapping",
        defaultValue: { sourcePath: "$.contact.email", targetPath: "contact.email" },
        objectConfig: {
          fields: [
            { name: "sourcePath", type: "text", label: "Source JSON path" },
            { name: "targetPath", type: "text", label: "Target event payload path" },
          ],
        },
      },
    },
  ] satisfies readonly FormedibleFieldConfig<IncomingWebhookFormValues>[];

  const { Form } = useFormedible<IncomingWebhookFormValues>({
    schema: incomingWebhookFormSchema,
    fields,
    formOptions: {
      defaultValues: {
        name: "External intake",
        slug: "external-intake",
        token: "",
        targetEventType: "webhook.webhook_received",
        mappingConfig: { mappings: [{ sourcePath: "$.contact.email", targetPath: "contact.email" }] },
      },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Create incoming webhook in test mode",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}
