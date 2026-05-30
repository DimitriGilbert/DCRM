import { db } from "@DCRM/db";
import { emailAccounts } from "@DCRM/db/schema/automation";
import { createEmailCredentialConfig } from "@DCRM/email";
import { env } from "@DCRM/env/server";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createEmailAccountSchema } from "./schemas";

export const createEmailAccount = protectedProcedure
  .input(createEmailAccountSchema)
  .mutation(async ({ ctx, input }) => {
    const credentialConfig = createEmailCredentialConfig(env.ENCRYPTION_KEY);
    const encryptedImap = credentialConfig.encryptImap({
      host: input.imapHost,
      port: input.imapPort,
      user: input.imapUser,
      password: input.imapPassword,
    });
    const encryptedSmtp = credentialConfig.encryptSmtp({
      host: input.smtpHost,
      port: input.smtpPort,
      user: input.smtpUser,
      password: input.smtpPassword,
    });

    const id = nanoid();
    const now = new Date();

    await db.insert(emailAccounts).values({
      id,
      userId: ctx.user.id,
      email: input.email,
      encryptedImapHost: encryptedImap.encryptedImapHost,
      encryptedImapPort: encryptedImap.encryptedImapPort,
      encryptedImapUser: encryptedImap.encryptedImapUser,
      encryptedImapPassword: encryptedImap.encryptedImapPassword,
      encryptedSmtpHost: encryptedSmtp.encryptedSmtpHost,
      encryptedSmtpPort: encryptedSmtp.encryptedSmtpPort,
      encryptedSmtpUser: encryptedSmtp.encryptedSmtpUser,
      encryptedSmtpPassword: encryptedSmtp.encryptedSmtpPassword,
      syncEnabled: input.syncEnabled,
      syncInterval: input.syncInterval,
      lastSyncAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      email: input.email,
      syncEnabled: input.syncEnabled,
      syncInterval: input.syncInterval,
      createdAt: now,
      updatedAt: now,
    };
  });
