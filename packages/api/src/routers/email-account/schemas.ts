import { z } from "zod";

export const createEmailAccountSchema = z.object({
  email: z.string().min(1),
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapUser: z.string().min(1),
  imapPassword: z.string().min(1),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPassword: z.string().min(1),
  syncEnabled: z.boolean().default(false),
  syncInterval: z.number().int().min(1).max(1440).default(15),
});

export type CreateEmailAccountInput = z.infer<typeof createEmailAccountSchema>;

export const updateEmailAccountSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1).optional(),
  imapHost: z.string().min(1).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapUser: z.string().min(1).optional(),
  imapPassword: z.string().min(1).optional(),
  smtpHost: z.string().min(1).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().min(1).optional(),
  smtpPassword: z.string().min(1).optional(),
  syncEnabled: z.boolean().optional(),
  syncInterval: z.number().int().min(1).max(1440).optional(),
});

export type UpdateEmailAccountInput = z.infer<typeof updateEmailAccountSchema>;

export const emailAccountIdSchema = z.object({
  id: z.string().min(1),
});

export type EmailAccountIdInput = z.infer<typeof emailAccountIdSchema>;

export const addAuthorizedAddressSchema = z.object({
  clientId: z.string().min(1),
  patterns: z.array(z.string().min(1)).min(1),
});

export type AddAuthorizedAddressInput = z.infer<typeof addAuthorizedAddressSchema>;

export const removeAuthorizedAddressSchema = z.object({
  clientId: z.string().min(1),
  pattern: z.string().min(1),
});

export type RemoveAuthorizedAddressInput = z.infer<typeof removeAuthorizedAddressSchema>;
