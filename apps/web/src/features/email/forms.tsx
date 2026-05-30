import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

export const emailAccountFormSchema = z.object({
  name: z.string().trim().min(1),
  emailAddress: z.email(),
  imapHost: z.string().trim().min(1),
  imapPort: z.number().int().min(1).max(65_535),
  imapUsername: z.string().trim().min(1),
  imapPassword: z.string().min(1),
  smtpHost: z.string().trim().min(1),
  smtpPort: z.number().int().min(1).max(65_535),
  smtpUsername: z.string().trim().min(1),
  smtpPassword: z.string().min(1),
  enabled: z.boolean(),
});

export const authorizedEmailFormSchema = z.object({
  clientId: z.string().trim().min(1),
  pattern: z.string().trim().min(3),
});

export type EmailAccountFormValues = Record<string, unknown> & z.infer<typeof emailAccountFormSchema>;
export type AuthorizedEmailFormValues = Record<string, unknown> & z.infer<typeof authorizedEmailFormSchema>;

export type ClientEmailOption = {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
};

export function EmailAccountForm({ submitting, onSubmit }: { readonly submitting: boolean; readonly onSubmit: (values: EmailAccountFormValues) => Promise<void> }) {
  const fields = [
    { name: "name", type: "text", label: "Account name" },
    { name: "emailAddress", type: "email", label: "Mailbox address" },
    { name: "imapHost", type: "text", label: "IMAP host" },
    { name: "imapPort", type: "number", label: "IMAP port", min: 1, max: 65_535 },
    { name: "imapUsername", type: "text", label: "IMAP username" },
    { name: "imapPassword", type: "password", label: "IMAP password", description: "Encrypted at rest before storage." },
    { name: "smtpHost", type: "text", label: "SMTP host" },
    { name: "smtpPort", type: "number", label: "SMTP port", min: 1, max: 65_535 },
    { name: "smtpUsername", type: "text", label: "SMTP username" },
    { name: "smtpPassword", type: "password", label: "SMTP password", description: "Encrypted at rest before storage." },
    { name: "enabled", type: "switch", label: "Enabled" },
  ] satisfies readonly FormedibleFieldConfig<EmailAccountFormValues>[];

  const { Form } = useFormedible<EmailAccountFormValues>({
    schema: emailAccountFormSchema,
    fields,
    formOptions: {
      defaultValues: {
        name: "Primary mailbox",
        emailAddress: "",
        imapHost: "",
        imapPort: 993,
        imapUsername: "",
        imapPassword: "",
        smtpHost: "",
        smtpPort: 465,
        smtpUsername: "",
        smtpPassword: "",
        enabled: true,
      },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Save email account",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}

export function AuthorizedEmailForm({ clients, submitting, onSubmit }: { readonly clients: readonly ClientEmailOption[]; readonly submitting: boolean; readonly onSubmit: (values: AuthorizedEmailFormValues) => Promise<void> }) {
  const clientOptions = clients.map((client) => ({ value: client.id, label: client.email ? `${client.name} · ${client.email}` : client.name }));
  const fields = [
    { name: "clientId", type: "select", label: "Client", options: clientOptions },
    { name: "pattern", type: "text", label: "Authorized sender", description: "Use an exact address or a wildcard domain such as *@company.com." },
  ] satisfies readonly FormedibleFieldConfig<AuthorizedEmailFormValues>[];

  const { Form } = useFormedible<AuthorizedEmailFormValues>({
    schema: authorizedEmailFormSchema,
    fields,
    formOptions: {
      defaultValues: {
        clientId: clients[0]?.id ?? "",
        pattern: "",
      },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: "Add authorized sender",
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}
