/**
 * SMTP email sending with loop prevention.
 *
 * Sends plain-text emails through an abstracted transport.
 * All outgoing emails include the X-DCRM-Sent header so the
 * IMAP sync pipeline skips re-importing them.
 */

import type { SmtpCredentials } from "./config";

// ── Constants ────────────────────────────────────────────────────────────

/** Header name used to mark outgoing DCRM emails. */
export const LOOP_PREVENTION_HEADER = "X-DCRM-Sent";

/** Header value for loop prevention. */
const LOOP_PREVENTION_VALUE = "true";

// ── Types ────────────────────────────────────────────────────────────────

/** Options for sending a plain-text email. */
export type SendEmailOptions = {
  /** Recipient email address. */
  readonly to: string;
  /** Email subject line. */
  readonly subject: string;
  /** Plain-text email body. */
  readonly body: string;
  /** Message-Id to reply to (sets In-Reply-To header). */
  readonly inReplyTo?: string;
  /** References header value for threading. */
  readonly references?: string;
  /** CC recipients. */
  readonly cc?: readonly string[];
};

/** Result of a successful email send. */
export type SendEmailResult = {
  /** The Message-Id assigned to the sent email. */
  readonly messageId: string;
  /** Timestamp when the email was sent. */
  readonly sentAt: Date;
};

/** Abstract transport for sending emails. */
export type SmtpTransport = {
  readonly send: (mail: {
    readonly from: string;
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly headers: Record<string, string>;
    readonly cc?: string;
  }) => Promise<{ readonly messageId: string }>;
};

// ── Transport creation ───────────────────────────────────────────────────

/**
 * Creates a real SMTP transport using nodemailer.
 * Production use only — tests inject a mock SmtpTransport.
 */
export async function createNodemailerTransport(
  credentials: SmtpCredentials,
): Promise<SmtpTransport> {
  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.createTransport({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.port === 465,
    auth: {
      user: credentials.user,
      pass: credentials.password,
    },
  });

  return {
    async send(mail) {
      const result = await transporter.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        headers: mail.headers,
        cc: mail.cc,
      });
      return { messageId: result.messageId };
    },
  };
}

// ── Core send function ───────────────────────────────────────────────────

/**
 * Sends a plain-text email with the loop-prevention header.
 *
 * Always includes `X-DCRM-Sent: true` to prevent the sync pipeline
 * from re-importing the outgoing message.
 */
export async function sendPlainEmail(
  transport: SmtpTransport,
  from: string,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const headers: Record<string, string> = {
    [LOOP_PREVENTION_HEADER]: LOOP_PREVENTION_VALUE,
  };

  if (options.inReplyTo) {
    headers["In-Reply-To"] = options.inReplyTo;
  }

  if (options.references) {
    headers["References"] = options.references;
  }

  const result = await transport.send({
    from,
    to: options.to,
    subject: options.subject,
    text: options.body,
    headers,
    cc: options.cc?.join(", "),
  });

  return {
    messageId: result.messageId,
    sentAt: new Date(),
  };
}
