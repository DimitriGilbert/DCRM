import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

const webhookAuthTypes = ["none", "bearer", "basic", "hmac", "custom_headers"] as const;

const customHeaderSchema = z.object({
  name: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export const outgoingWebhookFormSchema = z.object({
  name: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  enabled: z.boolean(),
  url: z.url(),
  authType: z.enum(webhookAuthTypes),
  bearerToken: z.string().optional(),
  basicUsername: z.string().optional(),
  basicPassword: z.string().optional(),
  hmacSecret: z.string().optional(),
  hmacHeaderName: z.string().trim().min(1),
  customHeaders: z.array(customHeaderSchema),
  maxAttempts: z.number().int().min(1).max(10),
  backoffType: z.enum(["fixed", "exponential"]),
  backoffDelayMs: z.number().int().min(0).max(86_400_000),
});

export type OutgoingWebhookFormValues = Record<string, unknown> & z.infer<typeof outgoingWebhookFormSchema>;

export type OutgoingWebhookSubmitValues = {
  readonly name: string;
  readonly eventType: string;
  readonly enabled: boolean;
  readonly url: string;
  readonly auth:
    | { readonly type: "none" }
    | { readonly type: "bearer"; readonly token: string }
    | { readonly type: "basic"; readonly username: string; readonly password: string }
    | { readonly type: "hmac"; readonly secret: string; readonly headerName: string }
    | { readonly type: "custom_headers"; readonly headers: readonly { readonly name: string; readonly value: string }[] };
  readonly headers: Record<string, string>;
  readonly retryPolicy: {
    readonly maxAttempts: number;
    readonly backoff: { readonly type: "fixed" | "exponential"; readonly delayMs: number };
  };
};

const authTypeOptions = [
  { value: "none", label: "No auth" },
  { value: "bearer", label: "Bearer token" },
  { value: "basic", label: "Basic auth" },
  { value: "hmac", label: "HMAC signature" },
  { value: "custom_headers", label: "Custom secret headers" },
] satisfies readonly { readonly value: OutgoingWebhookFormValues["authType"]; readonly label: string }[];

const backoffOptions = [
  { value: "fixed", label: "Fixed" },
  { value: "exponential", label: "Exponential" },
] satisfies readonly { readonly value: OutgoingWebhookFormValues["backoffType"]; readonly label: string }[];

export function OutgoingWebhookForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: OutgoingWebhookSubmitValues) => Promise<void> }) {
  const fields = [
    { name: "name", type: "text", label: "Hook name" },
    { name: "eventType", type: "text", label: "Event type", description: "For example: client.created or ticket.status_changed." },
    { name: "enabled", type: "switch", label: "Enabled" },
    { name: "url", type: "text", label: "Webhook URL", description: "DCRM sends a POST JSON payload to this URL." },
    { name: "authType", type: "select", label: "Authentication", options: authTypeOptions },
    { name: "bearerToken", type: "password", label: "Bearer token", description: "Encrypted at rest.", conditional: (values) => values.authType === "bearer" },
    { name: "basicUsername", type: "text", label: "Basic username", conditional: (values) => values.authType === "basic" },
    { name: "basicPassword", type: "password", label: "Basic password", description: "Encrypted at rest.", conditional: (values) => values.authType === "basic" },
    { name: "hmacSecret", type: "password", label: "HMAC secret", description: "Encrypted at rest and used to sign the request body with SHA-256.", conditional: (values) => values.authType === "hmac" },
    { name: "hmacHeaderName", type: "text", label: "HMAC header name", conditional: (values) => values.authType === "hmac" },
    {
      name: "customHeaders",
      type: "array",
      label: "Custom secret headers",
      description: "Header values are encrypted at rest.",
      conditional: (values) => values.authType === "custom_headers",
      arrayConfig: {
        itemType: "object",
        itemLabel: "Header",
        addButtonLabel: "Add header",
        defaultValue: { name: "X-Api-Key", value: "" },
        objectConfig: {
          fields: [
            { name: "name", type: "text", label: "Header name" },
            { name: "value", type: "password", label: "Header value" },
          ],
        },
      },
    },
    { name: "maxAttempts", type: "number", label: "Max attempts", min: 1, max: 10 },
    { name: "backoffType", type: "select", label: "Retry backoff", options: backoffOptions },
    { name: "backoffDelayMs", type: "number", label: "Backoff delay (ms)", min: 0, max: 86_400_000 },
  ] satisfies readonly FormedibleFieldConfig<OutgoingWebhookFormValues>[];

  const { Form } = useFormedible<OutgoingWebhookFormValues>({
    schema: outgoingWebhookFormSchema,
    fields,
    formOptions: {
      defaultValues: {
        name: "Notify external tool",
        eventType: "client.created",
        enabled: true,
        url: "https://example.com/webhooks/dcrm",
        authType: "none" as const,
        bearerToken: "",
        basicUsername: "",
        basicPassword: "",
        hmacSecret: "",
        hmacHeaderName: "X-DCRM-Signature",
        customHeaders: [],
        maxAttempts: 3,
        backoffType: "exponential" as const,
        backoffDelayMs: 1_000,
      },
      onSubmit: async ({ value }) => onSubmit(toSubmitValues(value)),
    },
    submitLabel: "Save outgoing webhook",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

function toSubmitValues(values: OutgoingWebhookFormValues): OutgoingWebhookSubmitValues {
  return {
    name: values.name,
    eventType: values.eventType,
    enabled: values.enabled,
    url: values.url,
    auth: toAuthSubmitValues(values),
    headers: {},
    retryPolicy: {
      maxAttempts: values.maxAttempts,
      backoff: { type: values.backoffType, delayMs: values.backoffDelayMs },
    },
  };
}

function toAuthSubmitValues(values: OutgoingWebhookFormValues): OutgoingWebhookSubmitValues["auth"] {
  switch (values.authType) {
    case "none":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", token: requireSecretField(values.bearerToken, "Bearer token") };
    case "basic":
      return { type: "basic", username: requireSecretField(values.basicUsername, "Basic username"), password: requireSecretField(values.basicPassword, "Basic password") };
    case "hmac":
      return { type: "hmac", secret: requireSecretField(values.hmacSecret, "HMAC secret"), headerName: values.hmacHeaderName };
    case "custom_headers":
      return { type: "custom_headers", headers: values.customHeaders };
  }
}

function requireSecretField(value: string | undefined, label: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}
