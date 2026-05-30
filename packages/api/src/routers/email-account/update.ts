import { db } from "@DCRM/db";
import { emailAccounts } from "@DCRM/db/schema/automation";
import { createEmailCredentialConfig } from "@DCRM/email";
import { env } from "@DCRM/env/server";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateEmailAccountSchema } from "./schemas";

export const updateEmailAccount = protectedProcedure
  .input(updateEmailAccountSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;

    // Fetch current row to re-encrypt only changed credential fields
    const [existing] = await db
      .select()
      .from(emailAccounts)
      .where(
        and(
          eq(emailAccounts.id, id),
          eq(emailAccounts.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const credentialConfig = createEmailCredentialConfig(env.ENCRYPTION_KEY);

    const setValues: Partial<typeof emailAccounts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.email !== undefined) setValues.email = updates.email;
    if (updates.syncEnabled !== undefined) setValues.syncEnabled = updates.syncEnabled;
    if (updates.syncInterval !== undefined) setValues.syncInterval = updates.syncInterval;

    if (
      updates.imapHost !== undefined ||
      updates.imapPort !== undefined ||
      updates.imapUser !== undefined ||
      updates.imapPassword !== undefined
    ) {
      const currentImap = credentialConfig.decryptImap({
        encryptedImapHost: existing.encryptedImapHost,
        encryptedImapPort: existing.encryptedImapPort,
        encryptedImapUser: existing.encryptedImapUser,
        encryptedImapPassword: existing.encryptedImapPassword,
      });

      const updatedImap = credentialConfig.encryptImap({
        host: updates.imapHost ?? currentImap.host,
        port: updates.imapPort ?? currentImap.port,
        user: updates.imapUser ?? currentImap.user,
        password: updates.imapPassword ?? currentImap.password,
      });

      setValues.encryptedImapHost = updatedImap.encryptedImapHost;
      setValues.encryptedImapPort = updatedImap.encryptedImapPort;
      setValues.encryptedImapUser = updatedImap.encryptedImapUser;
      setValues.encryptedImapPassword = updatedImap.encryptedImapPassword;
    }

    if (
      updates.smtpHost !== undefined ||
      updates.smtpPort !== undefined ||
      updates.smtpUser !== undefined ||
      updates.smtpPassword !== undefined
    ) {
      const currentSmtp = credentialConfig.decryptSmtp({
        encryptedSmtpHost: existing.encryptedSmtpHost,
        encryptedSmtpPort: existing.encryptedSmtpPort,
        encryptedSmtpUser: existing.encryptedSmtpUser,
        encryptedSmtpPassword: existing.encryptedSmtpPassword,
      });

      const updatedSmtp = credentialConfig.encryptSmtp({
        host: updates.smtpHost ?? currentSmtp.host,
        port: updates.smtpPort ?? currentSmtp.port,
        user: updates.smtpUser ?? currentSmtp.user,
        password: updates.smtpPassword ?? currentSmtp.password,
      });

      setValues.encryptedSmtpHost = updatedSmtp.encryptedSmtpHost;
      setValues.encryptedSmtpPort = updatedSmtp.encryptedSmtpPort;
      setValues.encryptedSmtpUser = updatedSmtp.encryptedSmtpUser;
      setValues.encryptedSmtpPassword = updatedSmtp.encryptedSmtpPassword;
    }

    await db
      .update(emailAccounts)
      .set(setValues)
      .where(
        and(
          eq(emailAccounts.id, id),
          eq(emailAccounts.userId, ctx.user.id),
        ),
      );

    return { id };
  });
