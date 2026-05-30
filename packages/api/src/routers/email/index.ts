import { z } from "zod";

import type { SecretCrypto } from "@DCRM/crypto";

import { authorizedEmailPatternsOverlap, normalizeAuthorizedEmailPattern, matchAuthorizedEmailSender, normalizeEmailAddress } from "../../email/matching.js";
import { protectedProcedure, router } from "../../index.js";

import type { AutomationRepository } from "../../automation/repository.js";

const emailAccountInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  emailAddress: z.email(),
  imapHost: z.string().trim().min(1).max(255),
  imapPort: z.number().int().min(1).max(65_535),
  imapUsername: z.string().trim().min(1).max(255),
  imapPassword: z.string().min(1).max(4_096),
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65_535),
  smtpUsername: z.string().trim().min(1).max(255),
  smtpPassword: z.string().min(1).max(4_096),
  enabled: z.boolean().default(true),
});

const authorizedEmailPatternSchema = z.string().trim().min(3).max(320).superRefine((value, ctx) => {
  const normalized = normalizeAuthorizedEmailPattern(value);
  const exact = z.email().safeParse(normalized);
  const wildcardDomain = /^\*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(normalized);
  if (!exact.success && !wildcardDomain) {
    ctx.addIssue({ code: "custom", message: "Use an exact email address or wildcard domain like *@example.com." });
  }
});

export const emailRouter = router({
  listAccounts: protectedProcedure.query(async ({ ctx }) => {
    return requireAutomationRepository(ctx.automationRepository).emailAccounts.listSafe({ userId: ctx.auth.user.id });
  }),
  upsertAccount: protectedProcedure.input(emailAccountInputSchema).mutation(async ({ ctx, input }) => {
    const secretCrypto = requireSecretCrypto(ctx.secretCrypto);
    assertSafeImapAccountConfiguration(input.imapPort, input.imapUsername, input.imapPassword);
    return requireAutomationRepository(ctx.automationRepository).emailAccounts.upsertEncrypted({
      ...(input.id ? { id: input.id } : {}),
      userId: ctx.auth.user.id,
      name: input.name.trim(),
      emailAddress: normalizeEmailAddress(input.emailAddress),
      imapHost: input.imapHost.trim(),
      imapPort: input.imapPort,
      imapUsername: input.imapUsername.trim(),
      encryptedImapPassword: secretCrypto.encrypt(input.imapPassword),
      smtpHost: input.smtpHost.trim(),
      smtpPort: input.smtpPort,
      smtpUsername: input.smtpUsername.trim(),
      encryptedSmtpPassword: secretCrypto.encrypt(input.smtpPassword),
      enabled: input.enabled,
      now: new Date(),
    });
  }),
  listClientAuthorizedEmails: protectedProcedure.input(z.object({ clientId: z.string().trim().min(1) })).query(async ({ ctx, input }) => {
    return ctx.crmRepository.clientAuthorizedEmails.listForClient({ userId: ctx.auth.user.id, clientId: input.clientId });
  }),
  addClientAuthorizedEmail: protectedProcedure.input(z.object({ clientId: z.string().trim().min(1), pattern: authorizedEmailPatternSchema })).mutation(async ({ ctx, input }) => {
    const normalizedPattern = normalizeAuthorizedEmailPattern(input.pattern);
    const existingPatterns = await ctx.crmRepository.clientAuthorizedEmails.listForUser({ userId: ctx.auth.user.id });
    const overlap = existingPatterns.find((record) => authorizedEmailPatternsOverlap(record.pattern, normalizedPattern) && record.clientId !== input.clientId);
    if (overlap) {
      throw new Error("Authorized sender pattern overlaps another client.");
    }
    return ctx.crmRepository.clientAuthorizedEmails.add({
      id: crypto.randomUUID(),
      userId: ctx.auth.user.id,
      clientId: input.clientId,
      pattern: normalizedPattern,
      now: new Date(),
    });
  }),
  removeClientAuthorizedEmail: protectedProcedure.input(z.object({ id: z.string().trim().min(1) })).mutation(async ({ ctx, input }) => {
    return ctx.crmRepository.clientAuthorizedEmails.remove({ userId: ctx.auth.user.id, id: input.id });
  }),
  matchSender: protectedProcedure.input(z.object({ sender: z.email() })).query(async ({ ctx, input }) => {
    const patterns = await ctx.crmRepository.clientAuthorizedEmails.listForUser({ userId: ctx.auth.user.id });
    return matchAuthorizedEmailSender(input.sender, patterns);
  }),
});

function requireAutomationRepository(automationRepository: AutomationRepository | undefined): AutomationRepository {
  if (!automationRepository) {
    throw new Error("Automation repository is required for email account configuration.");
  }
  return automationRepository;
}

function assertSafeImapAccountConfiguration(port: number, username: string, password: string): void {
  const credentialsPresent = username.trim().length > 0 || password.trim().length > 0;
  if (credentialsPresent && !isImplicitTlsImapPort(port) && !isStartTlsImapPort(port)) {
    throw new Error("TLS or STARTTLS is required before IMAP authentication.");
  }
}

function isImplicitTlsImapPort(port: number): boolean {
  return port === 993;
}

function isStartTlsImapPort(port: number): boolean {
  return port === 143;
}

function requireSecretCrypto(secretCrypto: SecretCrypto | undefined): SecretCrypto {
  if (!secretCrypto) {
    throw new Error("Secret crypto is required for email credentials.");
  }
  return secretCrypto;
}
