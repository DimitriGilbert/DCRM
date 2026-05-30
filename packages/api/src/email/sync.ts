import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Queue, Worker } from "bullmq";

import type { JobsOptions, QueueOptions, WorkerOptions } from "bullmq";
import type { SecretCrypto } from "@DCRM/crypto";
import type { EventService } from "@DCRM/events";
import type { AddressObject as ParsedAddressObject, EmailAddress as ParsedEmailAddress } from "mailparser";

import { matchAuthorizedEmailSender, normalizeEmailAddress } from "./matching.js";

import type { AutomationRepository, EmailAccountEncryptedRecord } from "../automation/repository.js";
import type { CrmRepository } from "../crm/repository.js";
import type { ExchangeRecord } from "../crm/types.js";

type JsonObject = Record<string, unknown>;

export const DCRM_LOOP_PREVENTION_HEADER = "x-dcrm-sent";
export const EMAIL_SYNC_QUEUE_NAME = "dcrm.email.sync";

export type EmailAddress = {
  readonly email: string;
  readonly name?: string;
};

export type ImapEmailMessage = {
  readonly uid: string;
  readonly messageId: string;
  readonly from: EmailAddress;
  readonly to: readonly EmailAddress[];
  readonly cc?: readonly EmailAddress[];
  readonly subject?: string;
  readonly textBody?: string;
  readonly htmlBody?: string;
  readonly receivedAt: Date;
  readonly headers: Readonly<Record<string, string>>;
  readonly inReplyTo?: string;
  readonly references?: readonly string[];
};

export type DecryptedImapAccount = {
  readonly id: string;
  readonly userId: string;
  readonly emailAddress: string;
  readonly imapHost: string;
  readonly imapPort: number;
  readonly imapUsername: string;
  readonly imapPassword: string;
};

export type EmailSyncStateRecord = {
  readonly id: string;
  readonly userId: string;
  readonly emailAccountId: string;
  readonly mailbox: string;
  readonly lastUid: string | null;
  readonly syncCursor: string | null;
  readonly lastSyncedAt: Date | null;
  readonly status: "idle" | "running" | "failed";
  readonly error: JsonObject | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UnmatchedEmailRecord = {
  readonly id: string;
  readonly userId: string;
  readonly emailAccountId: string;
  readonly mailbox: string;
  readonly uid: string;
  readonly messageId: string;
  readonly fromEmail: string;
  readonly fromName: string | null;
  readonly subject: string | null;
  readonly bodyPreview: string;
  readonly receivedAt: Date;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
};

export type EmailSyncRepository = {
  readonly getState: (input: { readonly userId: string; readonly emailAccountId: string; readonly mailbox: string }) => Promise<EmailSyncStateRecord | null>;
  readonly markRunning: (input: { readonly userId: string; readonly emailAccountId: string; readonly mailbox: string; readonly now: Date }) => Promise<EmailSyncStateRecord>;
  readonly markSucceeded: (input: { readonly userId: string; readonly emailAccountId: string; readonly mailbox: string; readonly lastUid: string | null; readonly syncCursor: string | null; readonly now: Date }) => Promise<EmailSyncStateRecord>;
  readonly markFailed: (input: { readonly userId: string; readonly emailAccountId: string; readonly mailbox: string; readonly error: JsonObject; readonly now: Date }) => Promise<EmailSyncStateRecord>;
  readonly storeUnmatched: (input: StoreUnmatchedEmailInput) => Promise<UnmatchedEmailRecord>;
  readonly listUnmatched: (input: { readonly userId: string }) => Promise<readonly UnmatchedEmailRecord[]>;
};

export type StoreUnmatchedEmailInput = {
  readonly id: string;
  readonly userId: string;
  readonly emailAccountId: string;
  readonly mailbox: string;
  readonly uid: string;
  readonly messageId: string;
  readonly fromEmail: string;
  readonly fromName: string | null;
  readonly subject: string | null;
  readonly bodyPreview: string;
  readonly receivedAt: Date;
  readonly metadata: JsonObject;
  readonly now: Date;
};

export type ImapMailboxClient = {
  readonly fetchNewMessages: (input: { readonly account: DecryptedImapAccount; readonly mailbox: string; readonly state: EmailSyncStateRecord | null }) => Promise<ImapMailboxFetchResult>;
};

export type ImapMailboxFetchResult = {
  readonly messages: readonly ImapEmailMessage[];
  readonly uidValidity: string | null;
};

export type ImapNetworkFetchRange = string | number[];

export type ImapNetworkFetchQuery = {
  readonly uid: true;
  readonly source: true | { readonly maxLength: number };
  readonly envelope: true;
  readonly internalDate: true;
  readonly headers: true;
};

export type ImapNetworkFetchOptions = {
  readonly uid: true;
};

export type ImapNetworkAddress = {
  readonly name?: string;
  readonly address?: string;
};

export type ImapNetworkEnvelope = {
  readonly date?: Date;
  readonly subject?: string;
  readonly messageId?: string;
  readonly inReplyTo?: string;
  readonly from?: readonly ImapNetworkAddress[];
  readonly to?: readonly ImapNetworkAddress[];
  readonly cc?: readonly ImapNetworkAddress[];
};

export type ImapNetworkMessage = {
  readonly uid: number;
  readonly source?: Buffer;
  readonly envelope?: ImapNetworkEnvelope;
  readonly internalDate?: Date | string;
  readonly headers?: Buffer;
};

export type ImapNetworkLock = {
  readonly release: () => void;
};

export type ImapNetworkMailbox = {
  readonly uidValidity?: bigint | number | string;
};

export type ImapNetworkClient = {
  readonly mailbox?: ImapNetworkMailbox | false;
  readonly connect: () => Promise<void>;
  readonly getMailboxLock: (mailbox: string) => Promise<ImapNetworkLock>;
  readonly fetch: (range: ImapNetworkFetchRange, query: ImapNetworkFetchQuery, options: ImapNetworkFetchOptions) => AsyncIterable<ImapNetworkMessage>;
  readonly logout: () => Promise<void>;
};

export type CreateNodeImapMailboxClientOptions = {
  readonly connectionFactory?: (input: { readonly account: DecryptedImapAccount }) => ImapNetworkClient;
  readonly maxMessagesPerSync?: number;
  readonly maxMessageBytes?: number;
};

export type EmailSyncJobData = {
  readonly userId?: string;
  readonly emailAccountId?: string;
  readonly mailbox?: string;
};

export type EmailSyncJobResult = {
  readonly accountsProcessed: number;
  readonly messagesFetched: number;
  readonly exchangesCreated: number;
  readonly unmatchedStored: number;
  readonly loopPrevented: number;
};

export type EmailSyncQueue = {
  readonly enqueueSync: (data?: EmailSyncJobData, options?: JobsOptions) => Promise<void>;
  readonly scheduleRecurringSync: (input: { readonly intervalMs: number; readonly data?: EmailSyncJobData }) => Promise<void>;
};

export type CreateEmailSyncProcessorOptions = {
  readonly automationRepository: AutomationRepository;
  readonly crmRepository: CrmRepository;
  readonly emailSyncRepository: EmailSyncRepository;
  readonly eventService: EventService;
  readonly imapClient: ImapMailboxClient;
  readonly secretCrypto: SecretCrypto;
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
};

export type CreateProductionEmailSyncProcessorOptions = Omit<CreateEmailSyncProcessorOptions, "imapClient"> & {
  readonly imapClient?: ImapMailboxClient;
};

type EmailSyncWorkerFactoryInput = {
  readonly connection: WorkerOptions["connection"];
  readonly processor: (data: EmailSyncJobData) => Promise<EmailSyncJobResult>;
  readonly queueName: string;
  readonly workerOptions?: Omit<WorkerOptions, "connection">;
};

type CreateProductionEmailSyncWorkerOptions<TWorker> = CreateProductionEmailSyncProcessorOptions & {
  readonly connection: WorkerOptions["connection"];
  readonly queueName?: string;
  readonly workerOptions?: Omit<WorkerOptions, "connection">;
  readonly workerFactory?: (input: EmailSyncWorkerFactoryInput) => TWorker;
};

export function createEmailSyncProcessor({ automationRepository, clock = () => new Date(), crmRepository, emailSyncRepository, eventService, idGenerator = () => crypto.randomUUID(), imapClient, secretCrypto }: CreateEmailSyncProcessorOptions) {
  return async function processEmailSyncJob(data: EmailSyncJobData = {}): Promise<EmailSyncJobResult> {
    const mailbox = data.mailbox ?? "INBOX";
    const accounts = await listTargetAccounts(automationRepository, data);
    const totals = { accountsProcessed: 0, messagesFetched: 0, exchangesCreated: 0, unmatchedStored: 0, loopPrevented: 0 };

    for (const account of accounts) {
      totals.accountsProcessed += 1;
      const state = await emailSyncRepository.getState({ userId: account.userId, emailAccountId: account.id, mailbox });
      await emailSyncRepository.markRunning({ userId: account.userId, emailAccountId: account.id, mailbox, now: clock() });
      try {
        const fetchResult = await imapClient.fetchNewMessages({ account: decryptImapAccount(account, secretCrypto), mailbox, state });
        const messages = fetchResult.messages;
        totals.messagesFetched += messages.length;
        let lastUid = hasSameUidValidity(state, fetchResult.uidValidity) ? (state?.lastUid ?? null) : null;
        for (const message of messages) {
          lastUid = message.uid;
          if (hasLoopPreventionHeader(message)) {
            totals.loopPrevented += 1;
            continue;
          }
          const outcome = await processIncomingEmail({ account, crmRepository, emailSyncRepository, eventService, idGenerator, mailbox, message, now: clock() });
          if (outcome === "exchange") {
            totals.exchangesCreated += 1;
          } else if (outcome === "unmatched") {
            totals.unmatchedStored += 1;
          }
        }
        await emailSyncRepository.markSucceeded({ userId: account.userId, emailAccountId: account.id, mailbox, lastUid, syncCursor: fetchResult.uidValidity ?? state?.syncCursor ?? null, now: clock() });
      } catch (error) {
        await emailSyncRepository.markFailed({ userId: account.userId, emailAccountId: account.id, mailbox, error: safeError(error), now: clock() });
        throw error;
      }
    }

    return totals;
  };
}

export function createProductionEmailSyncProcessor(options: CreateProductionEmailSyncProcessorOptions) {
  return createEmailSyncProcessor({ ...options, imapClient: options.imapClient ?? createNodeImapMailboxClient() });
}

export function createNodeImapMailboxClient({ connectionFactory = createDefaultImapNetworkClient, maxMessageBytes = 5_000_000, maxMessagesPerSync = 50 }: CreateNodeImapMailboxClientOptions = {}): ImapMailboxClient {
  return {
    async fetchNewMessages(input) {
      const client = connectionFactory({ account: input.account });
      await client.connect();
      try {
        const lock = await client.getMailboxLock(input.mailbox);
        try {
          const messages: ImapEmailMessage[] = [];
          const uidValidity = normalizeMailboxUidValidity(client.mailbox);
          for await (const message of client.fetch(nextUidRange(input.state, uidValidity), { uid: true, source: { maxLength: maxMessageBytes }, envelope: true, internalDate: true, headers: true }, { uid: true })) {
            messages.push(await toImapEmailMessage(input.account, message));
            if (messages.length >= maxMessagesPerSync) {
              break;
            }
          }
          return { messages, uidValidity };
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }
    },
  };
}

export function createProductionEmailSyncWorker(input: CreateProductionEmailSyncWorkerOptions<undefined> & { readonly workerFactory?: undefined }): Worker<EmailSyncJobData, EmailSyncJobResult, string>;
export function createProductionEmailSyncWorker<TWorker>(input: CreateProductionEmailSyncWorkerOptions<TWorker> & { readonly workerFactory: (factoryInput: EmailSyncWorkerFactoryInput) => TWorker }): TWorker;
export function createProductionEmailSyncWorker<TWorker>({ connection, queueName = EMAIL_SYNC_QUEUE_NAME, workerFactory, workerOptions, ...processorOptions }: CreateProductionEmailSyncWorkerOptions<TWorker>): TWorker | Worker<EmailSyncJobData, EmailSyncJobResult, string> {
  const processor = createProductionEmailSyncProcessor(processorOptions);
  if (workerFactory) {
    return workerFactory({ connection, processor, queueName, ...(workerOptions ? { workerOptions } : {}) });
  }
  return createEmailSyncWorker({ connection, processor, queueName, workerOptions });
}

export function createBullMqEmailSyncQueue({ connection, defaultJobOptions, queueName = EMAIL_SYNC_QUEUE_NAME }: { readonly connection: QueueOptions["connection"]; readonly defaultJobOptions?: QueueOptions["defaultJobOptions"]; readonly queueName?: string }): EmailSyncQueue & { readonly close: () => Promise<void> } {
  const queue = new Queue<EmailSyncJobData, EmailSyncJobResult, string>(queueName, { connection, defaultJobOptions });
  return {
    async enqueueSync(data = {}, options) {
      await queue.add("sync", data, options);
    },
    async scheduleRecurringSync(input) {
      await queue.add("recurring-sync", input.data ?? {}, { jobId: "recurring-sync", repeat: { every: input.intervalMs } });
    },
    close() {
      return queue.close();
    },
  };
}

export function createEmailSyncWorker({ connection, processor, queueName = EMAIL_SYNC_QUEUE_NAME, workerOptions }: { readonly connection: WorkerOptions["connection"]; readonly processor: (data: EmailSyncJobData) => Promise<EmailSyncJobResult>; readonly queueName?: string; readonly workerOptions?: Omit<WorkerOptions, "connection"> }): Worker<EmailSyncJobData, EmailSyncJobResult, string> {
  return new Worker<EmailSyncJobData, EmailSyncJobResult, string>(queueName, (job) => processor(job.data), { ...workerOptions, connection });
}

function createDefaultImapNetworkClient({ account }: { readonly account: DecryptedImapAccount }): ImapNetworkClient {
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: { user: account.imapUsername, pass: account.imapPassword },
    clientInfo: { name: "DCRM" },
    logger: false,
  });
}

function nextUidRange(state: EmailSyncStateRecord | null, uidValidity: string | null): string {
  const lastUid = hasSameUidValidity(state, uidValidity) && state?.lastUid ? Number.parseInt(state.lastUid, 10) : 0;
  if (Number.isSafeInteger(lastUid) && lastUid > 0) {
    return `${lastUid + 1}:*`;
  }
  return "1:*";
}

function hasSameUidValidity(state: EmailSyncStateRecord | null, uidValidity: string | null): boolean {
  return !uidValidity || state?.syncCursor === uidValidity;
}

function normalizeUidValidity(value: bigint | number | string | undefined): string | null {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function normalizeMailboxUidValidity(mailbox: ImapNetworkMailbox | false | undefined): string | null {
  return mailbox ? normalizeUidValidity(mailbox.uidValidity) : null;
}

async function toImapEmailMessage(account: DecryptedImapAccount, message: ImapNetworkMessage): Promise<ImapEmailMessage> {
  if (message.source) {
    const parsed = await simpleParser(message.source);
    return {
      uid: String(message.uid),
      messageId: parsed.messageId ?? fallbackMessageId(account, message.uid),
      from: firstParsedAddress(parsed.from) ?? firstEnvelopeAddress(message.envelope?.from) ?? { email: "unknown@example.invalid" },
      to: parsedAddresses(parsed.to, message.envelope?.to),
      cc: parsedAddresses(parsed.cc, message.envelope?.cc),
      subject: parsed.subject ?? message.envelope?.subject,
      textBody: parsed.text,
      htmlBody: parsed.html || undefined,
      receivedAt: parsed.date ?? dateFromInternal(message.internalDate) ?? message.envelope?.date ?? new Date(),
      headers: headersFromParsedLines(parsed.headerLines),
      inReplyTo: parsed.inReplyTo ?? message.envelope?.inReplyTo,
      references: parsedReferences(parsed.references),
    };
  }
  return {
    uid: String(message.uid),
    messageId: message.envelope?.messageId ?? fallbackMessageId(account, message.uid),
    from: firstEnvelopeAddress(message.envelope?.from) ?? { email: "unknown@example.invalid" },
    to: envelopeAddresses(message.envelope?.to),
    cc: envelopeAddresses(message.envelope?.cc),
    subject: message.envelope?.subject,
    receivedAt: dateFromInternal(message.internalDate) ?? message.envelope?.date ?? new Date(),
    headers: headersFromBuffer(message.headers),
    inReplyTo: message.envelope?.inReplyTo,
  };
}

function firstParsedAddress(address: ParsedAddressObject | undefined): EmailAddress | undefined {
  return parsedAddressList(address)[0];
}

function parsedAddresses(value: ParsedAddressObject | ParsedAddressObject[] | undefined, fallback: readonly ImapNetworkAddress[] | undefined): readonly EmailAddress[] {
  const parsed = Array.isArray(value) ? value.flatMap(parsedAddressList) : parsedAddressList(value);
  return parsed.length > 0 ? parsed : envelopeAddresses(fallback);
}

function parsedAddressList(value: ParsedAddressObject | undefined): readonly EmailAddress[] {
  return (value?.value ?? []).flatMap(parsedAddress);
}

function parsedAddress(value: ParsedEmailAddress): readonly EmailAddress[] {
  if (value.group) {
    return value.group.flatMap(parsedAddress);
  }
  return value.address ? [{ email: value.address, ...(value.name ? { name: value.name } : {}) }] : [];
}

function firstEnvelopeAddress(addresses: readonly ImapNetworkAddress[] | undefined): EmailAddress | undefined {
  return envelopeAddresses(addresses)[0];
}

function envelopeAddresses(addresses: readonly ImapNetworkAddress[] | undefined): readonly EmailAddress[] {
  return (addresses ?? []).flatMap((address) => (address.address ? [{ email: address.address, ...(address.name ? { name: address.name } : {}) }] : []));
}

function headersFromParsedLines(lines: readonly { readonly key: string; readonly line: string }[]): Readonly<Record<string, string>> {
  return Object.fromEntries(lines.map((line) => [line.key, headerLineValue(line.line)]));
}

function headersFromBuffer(headers: Buffer | undefined): Readonly<Record<string, string>> {
  if (!headers) {
    return {};
  }
  return Object.fromEntries(headers.toString("utf8").split(/\r?\n/u).flatMap((line) => {
    const separator = line.indexOf(":");
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1).trim()]] : [];
  }));
}

function headerLineValue(line: string): string {
  const separator = line.indexOf(":");
  return separator >= 0 ? line.slice(separator + 1).trim() : line.trim();
}

function parsedReferences(value: string | string[] | undefined): readonly string[] | undefined {
  if (!value) {
    return undefined;
  }
  return typeof value === "string" ? [value] : value;
}

function dateFromInternal(value: Date | string | undefined): Date | undefined {
  if (value instanceof Date) {
    return value;
  }
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function fallbackMessageId(account: DecryptedImapAccount, uid: number): string {
  return `<imap-${account.id}-${uid}@dcrm.local>`;
}

export function createRecordingEmailSyncQueue(): EmailSyncQueue & { readonly jobs: readonly { readonly data: EmailSyncJobData; readonly options?: JobsOptions }[]; readonly schedules: readonly { readonly intervalMs: number; readonly data?: EmailSyncJobData }[] } {
  const jobs: { readonly data: EmailSyncJobData; readonly options?: JobsOptions }[] = [];
  const schedules: { readonly intervalMs: number; readonly data?: EmailSyncJobData }[] = [];
  return {
    jobs,
    schedules,
    async enqueueSync(data = {}, options) {
      jobs.push({ data, ...(options ? { options } : {}) });
    },
    async scheduleRecurringSync(input) {
      schedules.push(input);
    },
  };
}

export function createInMemoryEmailSyncRepository(): EmailSyncRepository {
  const states: EmailSyncStateRecord[] = [];
  const unmatched: UnmatchedEmailRecord[] = [];
  return {
    async getState(input) {
      return states.find((state) => state.userId === input.userId && state.emailAccountId === input.emailAccountId && state.mailbox === input.mailbox) ?? null;
    },
    async markRunning(input) {
      return upsertState(states, input, { status: "running", error: null, lastSyncedAt: null, lastUid: undefined, syncCursor: undefined });
    },
    async markSucceeded(input) {
      return upsertState(states, input, { status: "idle", error: null, lastSyncedAt: input.now, lastUid: input.lastUid, syncCursor: input.syncCursor });
    },
    async markFailed(input) {
      return upsertState(states, input, { status: "failed", error: input.error, lastSyncedAt: null, lastUid: undefined, syncCursor: undefined });
    },
    async storeUnmatched(input) {
      const existing = unmatched.find((record) => record.userId === input.userId && record.emailAccountId === input.emailAccountId && record.messageId === input.messageId);
      if (existing) {
        return existing;
      }
      const record: UnmatchedEmailRecord = { id: input.id, userId: input.userId, emailAccountId: input.emailAccountId, mailbox: input.mailbox, uid: input.uid, messageId: input.messageId, fromEmail: input.fromEmail, fromName: input.fromName, subject: input.subject, bodyPreview: input.bodyPreview, receivedAt: input.receivedAt, metadata: input.metadata, createdAt: input.now };
      unmatched.push(record);
      return record;
    },
    async listUnmatched(input) {
      return unmatched.filter((record) => record.userId === input.userId).toSorted((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime());
    },
  };
}

async function listTargetAccounts(automationRepository: AutomationRepository, data: EmailSyncJobData): Promise<readonly EmailAccountEncryptedRecord[]> {
  if (!data.userId) {
    return [];
  }
  const accounts = await automationRepository.emailAccounts.listEncrypted({ userId: data.userId });
  return accounts.filter((account) => account.enabled && (!data.emailAccountId || account.id === data.emailAccountId));
}

async function processIncomingEmail(input: { readonly account: EmailAccountEncryptedRecord; readonly crmRepository: CrmRepository; readonly emailSyncRepository: EmailSyncRepository; readonly eventService: EventService; readonly idGenerator: () => string; readonly mailbox: string; readonly message: ImapEmailMessage; readonly now: Date }): Promise<"exchange" | "existing-exchange" | "unmatched"> {
  const fromEmail = normalizeEmailAddress(input.message.from.email);
  const patterns = await input.crmRepository.clientAuthorizedEmails.listForUser({ userId: input.account.userId });
  const match = matchAuthorizedEmailSender(fromEmail, patterns);
  if (match.status === "matched") {
    const existingExchange = await findExistingSyncedEmailExchange({ crmRepository: input.crmRepository, userId: input.account.userId, emailAccountId: input.account.id, mailbox: input.mailbox, message: input.message });
    if (existingExchange) {
      return "existing-exchange";
    }
    const threadedExchange = await findThreadedTicketExchange({ crmRepository: input.crmRepository, userId: input.account.userId, message: input.message });
    if (threadedExchange && threadedExchange.clientId !== match.clientId) {
      await storeUnmatchedIncomingEmail(input, fromEmail, match.pattern);
      return "unmatched";
    }
    let createdByThisAttempt = true;
    const exchange = await input.crmRepository.exchanges.create({
      id: input.idGenerator(),
      userId: input.account.userId,
      fields: {
        clientId: match.clientId,
        projectId: threadedExchange?.projectId ?? null,
        ticketId: threadedExchange?.ticketId ?? null,
        type: "email",
        visibility: "external",
        subject: input.message.subject ?? null,
        body: emailBody(input.message),
        occurredAt: input.message.receivedAt,
        externalMessageId: input.message.messageId,
        syncedEmailAccountId: input.account.id,
        syncedEmailMailbox: input.mailbox,
        syncedEmailUid: input.message.uid,
        threadId: threadedExchange?.threadId ?? deriveThreadId(input.message),
        metadata: emailMetadata(input.message, input.account.id, input.mailbox, match.pattern),
      },
      now: input.now,
    }).catch(async (error: unknown) => {
      if (!isUniqueViolation(error, "exchanges_synced_email_identity_idx")) {
        throw error;
      }
      const duplicate = await findExistingSyncedEmailExchange({ crmRepository: input.crmRepository, userId: input.account.userId, emailAccountId: input.account.id, mailbox: input.mailbox, message: input.message });
      if (!duplicate) {
        throw error;
      }
      createdByThisAttempt = false;
      return duplicate;
    });
    if (!createdByThisAttempt) {
      return "existing-exchange";
    }
    await emitExchangeReceived(input.eventService, exchange, fromEmail, input.message, match.pattern);
    return "exchange";
  }

  await storeUnmatchedIncomingEmail(input, fromEmail, null);
  return "unmatched";
}

async function storeUnmatchedIncomingEmail(input: { readonly account: EmailAccountEncryptedRecord; readonly emailSyncRepository: EmailSyncRepository; readonly idGenerator: () => string; readonly mailbox: string; readonly message: ImapEmailMessage; readonly now: Date }, fromEmail: string, matchedPattern: string | null): Promise<void> {
  await input.emailSyncRepository.storeUnmatched({ id: input.idGenerator(), userId: input.account.userId, emailAccountId: input.account.id, mailbox: input.mailbox, uid: input.message.uid, messageId: input.message.messageId, fromEmail, fromName: input.message.from.name ?? null, subject: input.message.subject ?? null, bodyPreview: preview(emailBody(input.message)), receivedAt: input.message.receivedAt, metadata: emailMetadata(input.message, input.account.id, input.mailbox, matchedPattern), now: input.now });
}

async function findThreadedTicketExchange(input: { readonly crmRepository: CrmRepository; readonly userId: string; readonly message: ImapEmailMessage }): Promise<ExchangeRecord | undefined> {
  for (const messageId of threadingMessageIds(input.message)) {
    const matches = await input.crmRepository.exchanges.list({ userId: input.userId, search: messageId, includeDeleted: true });
    const threaded = matches.find((exchange) => exchange.ticketId && (exchange.externalMessageId === messageId || exchange.threadId === messageId));
    if (threaded) {
      return threaded;
    }
  }
  return undefined;
}

function threadingMessageIds(message: ImapEmailMessage): readonly string[] {
  return unique([...(message.inReplyTo ? [message.inReplyTo] : []), ...(message.references ?? [])]);
}

function decryptImapAccount(account: EmailAccountEncryptedRecord, secretCrypto: SecretCrypto): DecryptedImapAccount {
  return { id: account.id, userId: account.userId, emailAddress: account.emailAddress, imapHost: account.imapHost, imapPort: account.imapPort, imapUsername: account.imapUsername, imapPassword: secretCrypto.decrypt(account.encryptedImapPassword) };
}

function hasLoopPreventionHeader(message: ImapEmailMessage): boolean {
  const value = Object.entries(message.headers).find(([name]) => name.toLowerCase() === DCRM_LOOP_PREVENTION_HEADER)?.[1];
  return value?.trim().toLowerCase() === "true";
}

async function findExistingSyncedEmailExchange(input: { readonly crmRepository: CrmRepository; readonly userId: string; readonly emailAccountId: string; readonly mailbox: string; readonly message: ImapEmailMessage }): Promise<ExchangeRecord | undefined> {
  const exchanges = await input.crmRepository.exchanges.list({ userId: input.userId, type: "email", search: input.message.messageId, includeDeleted: true });
  return exchanges.find((exchange) => exchange.externalMessageId === input.message.messageId && isSameSyncedMessage(exchange, input.emailAccountId, input.mailbox, input.message.uid));
}

function isSameSyncedMessage(exchange: ExchangeRecord, emailAccountId: string, mailbox: string, uid: string): boolean {
  return exchange.syncedEmailAccountId === emailAccountId && exchange.syncedEmailMailbox === mailbox && exchange.syncedEmailUid === uid;
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { readonly code?: unknown; readonly constraint?: unknown };
  return candidate.code === "23505" && candidate.constraint === constraint;
}

function emailBody(message: ImapEmailMessage): string {
  return message.textBody?.trim() || message.htmlBody?.trim() || "";
}

function deriveThreadId(message: ImapEmailMessage): string {
  return message.references?.[0] ?? message.inReplyTo ?? message.messageId;
}

function emailMetadata(message: ImapEmailMessage, emailAccountId: string, mailbox: string, matchedPattern: string | null): JsonObject {
  return { emailAccountId, mailbox, uid: message.uid, from: addressMetadata(message.from), to: message.to.map(addressMetadata), cc: (message.cc ?? []).map(addressMetadata), headers: message.headers, inReplyTo: message.inReplyTo ?? null, references: message.references ?? [], matchedPattern };
}

function addressMetadata(address: EmailAddress): JsonObject {
  return { email: normalizeEmailAddress(address.email), name: address.name ?? null };
}

async function emitExchangeReceived(eventService: EventService, exchange: ExchangeRecord, fromEmail: string, message: ImapEmailMessage, matchedPattern: string): Promise<void> {
  await eventService.emitEmail({ type: "exchange.exchange_received", userId: exchange.userId, entity: { type: "exchange", id: exchange.id }, payload: { exchangeId: exchange.id, clientId: exchange.clientId, fromEmail, subject: message.subject ?? null, messageId: message.messageId, matchedPattern } });
}

function preview(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 500);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function safeError(error: unknown): JsonObject {
  return { message: error instanceof Error ? error.message : "Email sync failed." };
}

function upsertState(states: EmailSyncStateRecord[], input: { readonly userId: string; readonly emailAccountId: string; readonly mailbox: string; readonly now: Date }, patch: { readonly status: EmailSyncStateRecord["status"]; readonly error: JsonObject | null; readonly lastSyncedAt: Date | null; readonly lastUid: string | null | undefined; readonly syncCursor: string | null | undefined }): EmailSyncStateRecord {
  const index = states.findIndex((state) => state.userId === input.userId && state.emailAccountId === input.emailAccountId && state.mailbox === input.mailbox);
  const existing = index >= 0 ? states[index] : undefined;
  const record: EmailSyncStateRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    userId: input.userId,
    emailAccountId: input.emailAccountId,
    mailbox: input.mailbox,
    lastUid: patch.lastUid === undefined ? (existing?.lastUid ?? null) : patch.lastUid,
    syncCursor: patch.syncCursor === undefined ? (existing?.syncCursor ?? null) : patch.syncCursor,
    lastSyncedAt: patch.lastSyncedAt ?? existing?.lastSyncedAt ?? null,
    status: patch.status,
    error: patch.error,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  if (index >= 0) {
    states[index] = record;
  } else {
    states.push(record);
  }
  return record;
}
