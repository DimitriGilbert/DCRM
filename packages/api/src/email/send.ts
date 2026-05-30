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

export class TicketCommentEmailDeliveryError extends Error {
  constructor(message: string, readonly exchange: ExchangeRecord) {
    super(message);
    this.name = "TicketCommentEmailDeliveryError";
  }
}

export function createTicketCommentEmailSender(input: {
  readonly automationRepository: AutomationRepository;
  readonly crmRepository: CrmRepository;
  readonly secretCrypto: SecretCrypto;
  readonly smtpClient?: SmtpPlainTextClient;
  readonly idGenerator?: () => string;
}): TicketCommentEmailSender {
  const smtpClient = input.smtpClient ?? createNodeSmtpPlainTextClient();
  return async function sendTicketCommentEmail(sendInput) {
    const exchange = await input.crmRepository.exchanges.getById({ userId: sendInput.userId, id: sendInput.exchangeId });
    if (!exchange || exchange.deletedAt) {
      throw new Error("Ticket comment was not found.");
    }
    assertExternallySendableTicketComment(exchange);
    const previousSend = existingSentEmail(exchange);
    if (previousSend) {
      return previousSend;
    }
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
    const generatedMessageId = deterministicMessageId(exchange.id);
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

    const preparedExchange = await markSmtpSendPrepared(input.crmRepository, exchange, account.id, headers, generatedMessageId, sendInput.now);
    let result: Awaited<ReturnType<SmtpPlainTextClient["sendPlainText"]>>;
    try {
      result = await smtpClient.sendPlainText({ account: decryptSmtpAccount(account, input.secretCrypto), message });
    } catch (error) {
      const failedExchange = await markSmtpSendFailed(input.crmRepository, preparedExchange, error, sendInput.now);
      throw new TicketCommentEmailDeliveryError(getErrorMessage(error), failedExchange);
    }
    const messageId = result.messageId?.trim() || generatedMessageId;
    const updated = await input.crmRepository.exchanges.update({
      userId: sendInput.userId,
      id: exchange.id,
      fields: {
        externalMessageId: messageId,
        threadId: previousHeaders.threadId ?? previousHeaders.inReplyTo ?? messageId,
        metadata: { ...preparedExchange.metadata, smtp: { emailAccountId: account.id, preparedAt: sendInput.now.toISOString(), sentAt: sendInput.now.toISOString(), status: "accepted", headers, messageId } } satisfies JsonObject,
      },
      now: sendInput.now,
    });
    if (!updated) {
      throw new Error("Ticket comment email state was not saved.");
    }
    return { exchange: updated, messageId, headers };
  };
}

async function markSmtpSendFailed(crmRepository: CrmRepository, exchange: ExchangeRecord, error: unknown, now: Date): Promise<ExchangeRecord> {
  const smtp = exchange.metadata.smtp;
  const updated = await crmRepository.exchanges.update({
    userId: exchange.userId,
    id: exchange.id,
    fields: {
      metadata: { ...exchange.metadata, smtp: { ...(isJsonObject(smtp) ? smtp : {}), failedAt: now.toISOString(), status: "failed", error: getErrorMessage(error) } } satisfies JsonObject,
    },
    now,
  });
  return updated ?? exchange;
}

function existingSentEmail(exchange: ExchangeRecord): SendTicketCommentEmailResult | null {
  if (exchange.externalMessageId) {
    return { exchange, messageId: exchange.externalMessageId, headers: extractSentHeaders(exchange.metadata) };
  }
  const smtp = exchange.metadata.smtp;
  if (!isJsonObject(smtp) || typeof smtp.messageId !== "string") {
    return null;
  }
  if (smtp.status === "prepared" || smtp.status === "in_flight") {
    return { exchange, messageId: smtp.messageId, headers: extractSentHeaders(exchange.metadata) };
  }
  if (typeof smtp.sentAt !== "string") {
    return null;
  }
  return { exchange, messageId: smtp.messageId, headers: extractSentHeaders(exchange.metadata) };
}

async function markSmtpSendPrepared(crmRepository: CrmRepository, exchange: ExchangeRecord, emailAccountId: string, headers: Readonly<Record<string, string>>, messageId: string, now: Date): Promise<ExchangeRecord> {
  const updated = await crmRepository.exchanges.update({
    userId: exchange.userId,
    id: exchange.id,
    fields: {
      metadata: { ...exchange.metadata, smtp: { emailAccountId, preparedAt: now.toISOString(), status: "in_flight", headers, messageId } } satisfies JsonObject,
    },
    now,
  });
  if (!updated) {
    throw new Error("Ticket comment email idempotency state was not saved.");
  }
  return updated;
}

function deterministicMessageId(exchangeId: string): string {
  return `<dcrm-${sanitizeMessageIdToken(exchangeId)}@dcrm.local>`;
}

function sanitizeMessageIdToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "exchange";
}

function extractSentHeaders(metadata: JsonObject): Readonly<Record<string, string>> {
  const smtp = metadata.smtp;
  if (!isJsonObject(smtp) || !isJsonObject(smtp.headers)) {
    return {};
  }
  return Object.fromEntries(Object.entries(smtp.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Ticket comment email could not be sent.";
}
