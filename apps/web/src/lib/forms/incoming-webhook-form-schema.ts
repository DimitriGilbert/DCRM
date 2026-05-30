import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const incomingWebhookFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  secret: z.union([z.string().min(8, "Secret must be at least 8 characters"), z.literal(undefined)]),
});

type IncomingWebhookFormValues = z.infer<typeof incomingWebhookFormSchema>;

const incomingWebhookFormFields: readonly FormedibleFieldConfig<IncomingWebhookFormValues>[] = [
  {
    name: "name",
    type: "text",
    label: "Webhook Name",
    placeholder: "Stripe Webhook",
    required: true,
  },
  {
    name: "secret",
    type: "password",
    label: "HMAC Secret (optional)",
    placeholder: "Leave empty for token-only auth",
    section: "Security",
  },
];

const incomingWebhookFormDefaultValues: IncomingWebhookFormValues = {
  name: "",
  secret: undefined,
};

export {
  incomingWebhookFormSchema,
  incomingWebhookFormFields,
  incomingWebhookFormDefaultValues,
};
export type { IncomingWebhookFormValues };
