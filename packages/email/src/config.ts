/**
 * Encrypted IMAP/SMTP credential handling for email account configuration.
 *
 * Uses @DCRM/crypto for AES-256-GCM encryption/decryption of all
 * sensitive IMAP and SMTP credentials at rest.
 */

import { createCrypto } from "@DCRM/crypto";
import type { CryptoService, EncryptedValue } from "@DCRM/crypto";

// --- Plain-text credential types ---

/** Plain-text IMAP connection credentials. */
export type ImapCredentials = {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
};

/** Plain-text SMTP connection credentials. */
export type SmtpCredentials = {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
};

/** Combined plain-text credentials for a full email account. */
export type EmailAccountCredentials = {
  readonly email: string;
  readonly imap: ImapCredentials;
  readonly smtp: SmtpCredentials;
};

// --- Encrypted storage shape ---

/** A single encrypted field as stored in the database. */
export type EncryptedField = string; // JSON-serialized EncryptedValue

/** Encrypted credential fields as stored in the email_accounts table. */
export type EncryptedImapFields = {
  readonly encryptedImapHost: EncryptedField;
  readonly encryptedImapPort: EncryptedField;
  readonly encryptedImapUser: EncryptedField;
  readonly encryptedImapPassword: EncryptedField;
};

export type EncryptedSmtpFields = {
  readonly encryptedSmtpHost: EncryptedField;
  readonly encryptedSmtpPort: EncryptedField;
  readonly encryptedSmtpUser: EncryptedField;
  readonly encryptedSmtpPassword: EncryptedField;
};

export type EncryptedEmailAccountFields = EncryptedImapFields & EncryptedSmtpFields;

// --- Credential config service ---

/**
 * Service for encrypting and decrypting email account credentials.
 * Bound to a specific encryption master key.
 */
export type EmailCredentialConfig = {
  /** Encrypt IMAP credentials into database-ready encrypted fields. */
  encryptImap(credentials: ImapCredentials): EncryptedImapFields;
  /** Decrypt IMAP fields back to plain-text credentials. */
  decryptImap(fields: EncryptedImapFields): ImapCredentials;
  /** Encrypt SMTP credentials into database-ready encrypted fields. */
  encryptSmtp(credentials: SmtpCredentials): EncryptedSmtpFields;
  /** Decrypt SMTP fields back to plain-text credentials. */
  decryptSmtp(fields: EncryptedSmtpFields): SmtpCredentials;
  /** Encrypt a full email account's credentials. */
  encryptAccount(credentials: EmailAccountCredentials): EncryptedEmailAccountFields;
  /** Decrypt a full email account's encrypted fields. */
  decryptAccount(
    email: string,
    fields: EncryptedEmailAccountFields,
  ): EmailAccountCredentials;
};

function encryptField(crypto: CryptoService, value: string): EncryptedField {
  return JSON.stringify(crypto.encrypt(value));
}

function decryptField(crypto: CryptoService, encrypted: EncryptedField): string {
  const parsed = JSON.parse(encrypted) as EncryptedValue;
  return crypto.decrypt(parsed);
}

/**
 * Creates an email credential config service bound to the given master key.
 *
 * @param masterKey - Must be at least 32 characters. Used by the crypto module.
 */
export function createEmailCredentialConfig(masterKey: string): EmailCredentialConfig {
  const crypto = createCrypto(masterKey);

  return {
    encryptImap(credentials: ImapCredentials): EncryptedImapFields {
      return {
        encryptedImapHost: encryptField(crypto, credentials.host),
        encryptedImapPort: encryptField(crypto, String(credentials.port)),
        encryptedImapUser: encryptField(crypto, credentials.user),
        encryptedImapPassword: encryptField(crypto, credentials.password),
      };
    },

    decryptImap(fields: EncryptedImapFields): ImapCredentials {
      return {
        host: decryptField(crypto, fields.encryptedImapHost),
        port: Number(decryptField(crypto, fields.encryptedImapPort)),
        user: decryptField(crypto, fields.encryptedImapUser),
        password: decryptField(crypto, fields.encryptedImapPassword),
      };
    },

    encryptSmtp(credentials: SmtpCredentials): EncryptedSmtpFields {
      return {
        encryptedSmtpHost: encryptField(crypto, credentials.host),
        encryptedSmtpPort: encryptField(crypto, String(credentials.port)),
        encryptedSmtpUser: encryptField(crypto, credentials.user),
        encryptedSmtpPassword: encryptField(crypto, credentials.password),
      };
    },

    decryptSmtp(fields: EncryptedSmtpFields): SmtpCredentials {
      return {
        host: decryptField(crypto, fields.encryptedSmtpHost),
        port: Number(decryptField(crypto, fields.encryptedSmtpPort)),
        user: decryptField(crypto, fields.encryptedSmtpUser),
        password: decryptField(crypto, fields.encryptedSmtpPassword),
      };
    },

    encryptAccount(credentials: EmailAccountCredentials): EncryptedEmailAccountFields {
      return {
        ...this.encryptImap(credentials.imap),
        ...this.encryptSmtp(credentials.smtp),
      };
    },

    decryptAccount(
      email: string,
      fields: EncryptedEmailAccountFields,
    ): EmailAccountCredentials {
      return {
        email,
        imap: this.decryptImap(fields),
        smtp: this.decryptSmtp(fields),
      };
    },
  };
}
