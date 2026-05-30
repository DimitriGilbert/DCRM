import type { SecretCrypto } from "@DCRM/crypto";

import { createNodeSmtpPlainTextClient } from "./smtp.js";
import { DCRM_LOOP_PREVENTION_HEADER } from "./sync.js";

import type { AutomationRepository, EmailAccountEncryptedRecord } from "../automation/repository.js";
import type { CrmRepository } from "../crm/repository.js";
import type { ExchangeRecord } from "../crm/types.js";

type JsonObject = Record<string, unknown>;

export type SmtpPlainTextAccount = {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly fromEmail: string;
  readonly fromName: string;
};

export type SmtpPlainTextMessage = {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly messageId: string;
};

export type SmtpPlainTextClient = {
  readonly sendPlainText: (input: { readonly account: SmtpPlainTextAccount; readonly message: SmtpPlainTextMessage }) => Promise<{ readonly messageId?: string }>;
};

export type SendTicketCommentEmailInput = {
  readonly userId: string;
  readonly exchangeId: string;
  readonly emailAccountId?: string;
  readonly now: Date;
};

export type SendTicketCommentEmailResult = {
  readonly exchange: ExchangeRecord;
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
};

export type TicketCommentEmailSender = (input: SendTicketCommentEmailInput) => Promise<SendTicketCommentEmailResult>;

export function createTicketCommentEmailSender(input: {
  readonly automationRepository: AutomationRepository;
  readonly crmRepository: CrmRepository;
  readonly secretCrypto: SecretCrypto;
  readonly smtpClient?: SmtpPlainTextClient;
  readonly idGenerator?: () => string;
}): TicketCommentEmailSender {
  const idGenerator = input.idGenerator ?? (() => crypto.randomUUID());
  const smtpClient = input.smtpClient ?? createNodeSmtpPlainTextClient();
  return async function sendTicketCommentEmail(sendInput) {
    const exchange = await input.crmRepository.exchanges.getById({ userId: sendInput.userId, id: sendInput.exchangeId });
    if (!exchange || exchange.deletedAt) {
      throw new Error("Ticket comment was not found.");
    }
    assertExternallySendableTicketComment(exchange);
    const ticket = await input.crmRepository.tickets.getById({ userId: sendInput.userId, id: requireLinkedId(exchange.ticketId, "Ticket") });
    if (!ticket || ticket.deletedAt) {
      throw new Error("Ticket was not found.");
    }
    const client = await input.crmRepository.clients.getById({ userId: sendInput.userId, id: requireLinkedId(exchange.clientId, "Client") });
    if (!client || client.deletedAt || !client.email) {
      throw new Error("Client email address is required to send a ticket comment.");
    }
    const account = await selectEmailAccount(input.automationRepository, sendInput.userId, sendInput.emailAccountId);
    const previousHeaders = await findPreviousTicketThreadHeaders(input.crmRepository, exchange);
    const generatedMessageId = `<dcrm-${idGenerator()}@dcrm.local>`;
    const references = [...previousHeaders.references, ...(previousHeaders.inReplyTo ? [previousHeaders.inReplyTo] : [])];
    const headers = {
      [DCRM_LOOP_PREVENTION_HEADER]: "true",
      ...(previousHeaders.inReplyTo ? { "In-Reply-To": previousHeaders.inReplyTo } : {}),
      ...(references.length > 0 ? { References: unique(references).join(" ") } : {}),
    };
    const message = {
      from: account.emailAddress,
      to: [client.email],
      subject: `Re: ${ticket.title}`,
      text: exchange.body,
      headers,
      messageId: generatedMessageId,
    } satisfies SmtpPlainTextMessage;

    const result = await smtpClient.sendPlainText({ account: decryptSmtpAccount(account, input.secretCrypto), message });
    const messageId = result.messageId?.trim() || generatedMessageId;
    const updated = await input.crmRepository.exchanges.update({
      userId: sendInput.userId,
      id: exchange.id,
      fields: {
        externalMessageId: messageId,
        threadId: previousHeaders.threadId ?? previousHeaders.inReplyTo ?? messageId,
        metadata: { ...exchange.metadata, smtp: { emailAccountId: account.id, sentAt: sendInput.now.toISOString(), headers, messageId } } satisfies JsonObject,
      },
      now: sendInput.now,
    });
    if (!updated) {
      throw new Error("Ticket comment email state was not saved.");
    }
    return { exchange: updated, messageId, headers };
  };
}

function assertExternallySendableTicketComment(exchange: ExchangeRecord): void {
  if (exchange.type !== "comment" || !exchange.ticketId) {
    throw new Error("Only ticket comments can be sent by email.");
  }
  if (exchange.visibility !== "external") {
    throw new Error("Internal ticket comments cannot be sent externally.");
  }
}

function requireLinkedId(value: string | null, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for ticket comment email.`);
  }
  return value;
}

async function selectEmailAccount(repository: AutomationRepository, userId: string, emailAccountId: string | undefined): Promise<EmailAccountEncryptedRecord> {
  const accounts = await repository.emailAccounts.listEncrypted({ userId });
  const account = accounts.find((candidate) => candidate.enabled && (!emailAccountId || candidate.id === emailAccountId));
  if (!account) {
    throw new Error("Enabled SMTP account was not found.");
  }
  return account;
}

function decryptSmtpAccount(account: EmailAccountEncryptedRecord, secretCrypto: SecretCrypto): SmtpPlainTextAccount {
  return { host: account.smtpHost, port: account.smtpPort, username: account.smtpUsername, password: secretCrypto.decrypt(account.encryptedSmtpPassword), fromEmail: account.emailAddress, fromName: account.name };
}

async function findPreviousTicketThreadHeaders(crmRepository: CrmRepository, exchange: ExchangeRecord): Promise<{ readonly inReplyTo: string | null; readonly references: readonly string[]; readonly threadId: string | null }> {
  if (!exchange.ticketId) {
    return { inReplyTo: null, references: [], threadId: null };
  }
  const timeline = await crmRepository.exchanges.listTimeline({ userId: exchange.userId, ticketId: exchange.ticketId, includeDeleted: true });
  const previous = timeline.filter((candidate) => candidate.id !== exchange.id && candidate.externalMessageId).at(-1);
  if (!previous?.externalMessageId) {
    return { inReplyTo: null, references: [], threadId: null };
  }
  return { inReplyTo: previous.externalMessageId, references: extractReferences(previous.metadata), threadId: previous.threadId };
}

function extractReferences(metadata: JsonObject): readonly string[] {
  const smtp = metadata.smtp;
  if (!isJsonObject(smtp)) {
    return [];
  }
  const headers = smtp.headers;
  if (!isJsonObject(headers) || typeof headers.References !== "string") {
    return [];
  }
  return headers.References.split(/\s+/u).filter((value) => value.length > 0);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
