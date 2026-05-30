import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const emailAccountFormSchema = z.object({
  email: z.string().min(1, "Email address is required"),
  imapHost: z.string().min(1, "IMAP host is required"),
  imapPort: z.number().int().min(1).max(65535),
  imapUser: z.string().min(1, "IMAP username is required"),
  imapPassword: z.string().min(1, "IMAP password is required"),
  smtpHost: z.string().min(1, "SMTP host is required"),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1, "SMTP username is required"),
  smtpPassword: z.string().min(1, "SMTP password is required"),
  syncEnabled: z.boolean(),
  syncInterval: z.number().int().min(1).max(1440),
});

type EmailAccountFormValues = z.infer<typeof emailAccountFormSchema>;

const emailAccountFormFields: readonly FormedibleFieldConfig<EmailAccountFormValues>[] = [
  {
    name: "email",
    type: "email",
    label: "Email Address",
    placeholder: "you@example.com",
    required: true,
  },
  {
    name: "imapHost",
    type: "text",
    label: "IMAP Host",
    placeholder: "imap.gmail.com",
    required: true,
    section: { title: "IMAP Configuration" },
  },
  {
    name: "imapPort",
    type: "number",
    label: "IMAP Port",
    min: 1,
    max: 65535,
    required: true,
  },
  {
    name: "imapUser",
    type: "text",
    label: "IMAP Username",
    placeholder: "you@example.com",
    required: true,
  },
  {
    name: "imapPassword",
    type: "password",
    label: "IMAP Password",
    placeholder: "••••••••",
    required: true,
  },
  {
    name: "smtpHost",
    type: "text",
    label: "SMTP Host",
    placeholder: "smtp.gmail.com",
    required: true,
    section: { title: "SMTP Configuration" },
  },
  {
    name: "smtpPort",
    type: "number",
    label: "SMTP Port",
    min: 1,
    max: 65535,
    required: true,
  },
  {
    name: "smtpUser",
    type: "text",
    label: "SMTP Username",
    placeholder: "you@example.com",
    required: true,
  },
  {
    name: "smtpPassword",
    type: "password",
    label: "SMTP Password",
    placeholder: "••••••••",
    required: true,
  },
  {
    name: "syncEnabled",
    type: "switch",
    label: "Enable Email Sync",
    section: { title: "Sync Settings" },
  },
  {
    name: "syncInterval",
    type: "number",
    label: "Sync Interval (minutes)",
    min: 1,
    max: 1440,
  },
];

const emailAccountFormDefaultValues: EmailAccountFormValues = {
  email: "",
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPassword: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
  syncEnabled: false,
  syncInterval: 15,
};

export {
  emailAccountFormSchema,
  emailAccountFormFields,
  emailAccountFormDefaultValues,
};
export type { EmailAccountFormValues };
