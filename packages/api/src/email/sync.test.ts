import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";

import { createInMemoryAutomationRepository } from "../automation/repository.js";
import { createInMemoryCrmRepository } from "../crm/repository.js";
import { createEmailSyncProcessor, createInMemoryEmailSyncRepository, createNodeImapMailboxClient, createProductionEmailSyncProcessor, createProductionEmailSyncWorker, createRecordingEmailSyncQueue } from "./sync.js";

import type { EmailSyncJobData, EmailSyncJobResult, ImapEmailMessage, ImapMailboxClient, ImapNetworkClient, ImapNetworkMessage } from "./sync.js";

describe("IMAP email sync", () => {
  it("creates an exchange and emits an email event for matched incoming mail", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const eventService = createEventService({ repository: eventRepository, clock: () => now, idGenerator: nextId("event") });
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const account = await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme" }, now });
    await crmRepository.clientAuthorizedEmails.add({ id: "auth_1", userId: "user_1", clientId: client.id, pattern: "*@acme.test", now });
    const processor = createEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService, idGenerator: nextId("record"), imapClient: createMockImapClient([mockMessage({ from: "owner@acme.test", messageId: "<m1@acme.test>", uid: "42" })]), secretCrypto });

    const result = await processor({ userId: "user_1" });
    const exchanges = await crmRepository.exchanges.list({ userId: "user_1", type: "email" });
    const events = await eventRepository.listForUser("user_1");

    assert.deepEqual(result, { accountsProcessed: 1, messagesFetched: 1, exchangesCreated: 1, unmatchedStored: 0, loopPrevented: 0 });
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]?.clientId, client.id);
    assert.equal(exchanges[0]?.externalMessageId, "<m1@acme.test>");
    assert.equal(exchanges[0]?.syncedEmailAccountId, account.id);
    assert.equal(exchanges[0]?.syncedEmailMailbox, "INBOX");
    assert.equal(exchanges[0]?.syncedEmailUid, "42");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, "exchange.exchange_received");
    assert.equal(events[0]?.source, "email");
    assert.deepEqual(events[0]?.entity, { type: "exchange", id: exchanges[0]?.id });
  });

  it("stores unmatched mail for manual linking without creating an exchange", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const processor = createEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService: createEventService({ repository: eventRepository }), idGenerator: nextId("record"), imapClient: createMockImapClient([mockMessage({ from: "new@example.test", messageId: "<m2@example.test>", uid: "77" })]), secretCrypto });

    const result = await processor({ userId: "user_1" });
    const exchanges = await crmRepository.exchanges.list({ userId: "user_1", type: "email" });
    const unmatched = await emailSyncRepository.listUnmatched({ userId: "user_1" });

    assert.equal(result.unmatchedStored, 1);
    assert.equal(exchanges.length, 0);
    assert.equal(unmatched.length, 1);
    assert.equal(unmatched[0]?.fromEmail, "new@example.test");
    assert.equal(unmatched[0]?.messageId, "<m2@example.test>");
  });

  it("respects the DCRM loop-prevention header case-insensitively and still advances sync state", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const account = await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const processor = createEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService: createEventService({ repository: eventRepository }), idGenerator: nextId("record"), imapClient: createMockImapClient([mockMessage({ from: "owner@acme.test", headers: { "X-DcRm-SeNt": "true" }, messageId: "<sent@dcrm.test>", uid: "88" })]), secretCrypto });

    const result = await processor({ userId: "user_1" });
    const state = await emailSyncRepository.getState({ userId: "user_1", emailAccountId: account.id, mailbox: "INBOX" });

    assert.equal(result.loopPrevented, 1);
    assert.equal(result.exchangesCreated, 0);
    assert.equal(result.unmatchedStored, 0);
    assert.equal(state?.lastUid, "88");
    assert.equal(state?.status, "idle");
  });

  it("does not duplicate matched exchanges or events when the same IMAP message is retried", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const eventService = createEventService({ repository: eventRepository, clock: () => now, idGenerator: nextId("event") });
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme" }, now });
    await crmRepository.clientAuthorizedEmails.add({ id: "auth_1", userId: "user_1", clientId: client.id, pattern: "*@acme.test", now });
    const imapClient = createMockImapClient([mockMessage({ from: "owner@acme.test", messageId: "<retry@acme.test>", uid: "101" })]);
    const processor = createEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService, idGenerator: nextId("record"), imapClient, secretCrypto });

    const firstResult = await processor({ userId: "user_1" });
    const retryResult = await processor({ userId: "user_1" });
    const exchanges = await crmRepository.exchanges.list({ userId: "user_1", type: "email" });
    const events = await eventRepository.listForUser("user_1");

    assert.equal(firstResult.exchangesCreated, 1);
    assert.equal(retryResult.exchangesCreated, 0);
    assert.equal(exchanges.length, 1);
    assert.equal(events.length, 1);
    assert.equal(exchanges[0]?.externalMessageId, "<retry@acme.test>");
  });

  it("links client replies back to ticket threads using In-Reply-To headers", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme" }, now });
    const project = await crmRepository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: client.id, name: "Support" }, now });
    const ticket = await crmRepository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: project.id, title: "Broken form" }, now });
    await crmRepository.exchanges.create({ id: "comment_1", userId: "user_1", fields: { clientId: client.id, projectId: project.id, ticketId: ticket.id, type: "comment", visibility: "external", body: "Can you retry?", externalMessageId: "<dcrm-comment@example.test>", threadId: "<dcrm-comment@example.test>" }, now });
    await crmRepository.clientAuthorizedEmails.add({ id: "auth_1", userId: "user_1", clientId: client.id, pattern: "*@acme.test", now });
    const processor = createEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService: createEventService({ repository: eventRepository }), idGenerator: nextId("record"), imapClient: createMockImapClient([mockMessage({ from: "owner@acme.test", inReplyTo: "<dcrm-comment@example.test>", messageId: "<reply@acme.test>", references: ["<dcrm-comment@example.test>"], uid: "202" })]), secretCrypto });

    const result = await processor({ userId: "user_1" });
    const emails = await crmRepository.exchanges.list({ userId: "user_1", type: "email" });

    assert.equal(result.exchangesCreated, 1);
    assert.equal(emails[0]?.ticketId, ticket.id);
    assert.equal(emails[0]?.projectId, project.id);
    assert.equal(emails[0]?.threadId, "<dcrm-comment@example.test>");
  });

  it("stores a matched sender as unmatched when threading headers reference another client's ticket", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const acme = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme" }, now });
    const beta = await crmRepository.clients.create({ id: "client_2", userId: "user_1", fields: { name: "Beta" }, now });
    const betaProject = await crmRepository.projects.create({ id: "project_2", userId: "user_1", fields: { clientId: beta.id, name: "Private Support" }, now });
    const betaTicket = await crmRepository.tickets.create({ id: "ticket_2", userId: "user_1", fields: { projectId: betaProject.id, title: "Billing" }, now });
    await crmRepository.exchanges.create({ id: "comment_2", userId: "user_1", fields: { clientId: beta.id, projectId: betaProject.id, ticketId: betaTicket.id, type: "comment", visibility: "external", body: "Beta only", externalMessageId: "<beta-thread@example.test>", threadId: "<beta-thread@example.test>" }, now });
    await crmRepository.clientAuthorizedEmails.add({ id: "auth_1", userId: "user_1", clientId: acme.id, pattern: "*@acme.test", now });
    const processor = createEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService: createEventService({ repository: eventRepository }), idGenerator: nextId("record"), imapClient: createMockImapClient([mockMessage({ from: "owner@acme.test", inReplyTo: "<beta-thread@example.test>", messageId: "<cross-client@acme.test>", references: ["<beta-thread@example.test>"], uid: "303" })]), secretCrypto });

    const result = await processor({ userId: "user_1" });
    const emails = await crmRepository.exchanges.list({ userId: "user_1", type: "email" });
    const unmatched = await emailSyncRepository.listUnmatched({ userId: "user_1" });

    assert.equal(result.exchangesCreated, 0);
    assert.equal(result.unmatchedStored, 1);
    assert.equal(emails.length, 0);
    assert.equal(unmatched[0]?.messageId, "<cross-client@acme.test>");
  });

  it("records configurable recurring sync intervals at the BullMQ boundary", async () => {
    const queue = createRecordingEmailSyncQueue();

    await queue.scheduleRecurringSync({ intervalMs: 300_000, data: { userId: "user_1", mailbox: "INBOX" } });

    assert.deepEqual(queue.schedules, [{ intervalMs: 300_000, data: { userId: "user_1", mailbox: "INBOX" } }]);
  });

  it("uses the production IMAP boundary with decrypted stored account settings", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const account = await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const connections: FakeImapNetworkClient[] = [];
    const imapClient = createNodeImapMailboxClient({
      connectionFactory(input) {
        const connection = new FakeImapNetworkClient(input.account.imapPassword, [rawImapMessage({ uid: 404, messageId: "<prod-sync@example.test>", from: "new@example.test" })]);
        connections.push(connection);
        return connection;
      },
    });
    const processor = createProductionEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService: createEventService({ repository: eventRepository }), idGenerator: nextId("record"), imapClient, secretCrypto });

    const result = await processor({ userId: "user_1" });
    const unmatched = await emailSyncRepository.listUnmatched({ userId: "user_1" });

    assert.equal(result.messagesFetched, 1);
    assert.equal(result.unmatchedStored, 1);
    assert.equal(unmatched[0]?.messageId, "<prod-sync@example.test>");
    assert.equal(connections.length, 1);
    assert.equal(connections[0]?.passwordSeen, "imap-secret");
    assert.equal(connections[0]?.mailboxLocked, "INBOX");
    assert.deepEqual(connections[0]?.fetchRange, "1:*");
    assert.equal(connections[0]?.loggedOut, true);
    assert.equal(account.emailAddress, "me@example.com");
  });

  it("resets the IMAP UID cursor when UIDVALIDITY changes", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const { automationRepository, crmRepository } = createSyncedTestRepositories();
    const eventRepository = createInMemoryEventRepository();
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const account = await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    await emailSyncRepository.markSucceeded({ userId: "user_1", emailAccountId: account.id, mailbox: "INBOX", lastUid: "900", syncCursor: "old-validity", now });
    const connections: FakeImapNetworkClient[] = [];
    const imapClient = createNodeImapMailboxClient({
      connectionFactory(input) {
        const connection = new FakeImapNetworkClient(input.account.imapPassword, [rawImapMessage({ uid: 7, messageId: "<reset@example.test>", from: "new@example.test" })], "new-validity");
        connections.push(connection);
        return connection;
      },
    });
    const processor = createProductionEmailSyncProcessor({ automationRepository, clock: () => now, crmRepository, emailSyncRepository, eventService: createEventService({ repository: eventRepository }), idGenerator: nextId("record"), imapClient, secretCrypto });

    await processor({ userId: "user_1" });
    const state = await emailSyncRepository.getState({ userId: "user_1", emailAccountId: account.id, mailbox: "INBOX" });

    assert.deepEqual(connections[0]?.fetchRange, "1:*");
    assert.equal(state?.lastUid, "7");
    assert.equal(state?.syncCursor, "new-validity");
  });

  it("wires a production sync worker to the production IMAP client boundary", () => {
    const automationRepository = createInMemoryAutomationRepository();
    const crmRepository = createInMemoryCrmRepository();
    const emailSyncRepository = createInMemoryEmailSyncRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const createdWorkers: RecordingWorker[] = [];

    const worker = createProductionEmailSyncWorker({
      automationRepository,
      connection: { url: "redis://localhost:6379" },
      crmRepository,
      emailSyncRepository,
      eventService: createEventService({ repository: createInMemoryEventRepository() }),
      secretCrypto,
      workerFactory(input) {
        const recordingWorker = new RecordingWorker(input.processor, input.queueName);
        createdWorkers.push(recordingWorker);
        return recordingWorker;
      },
    });

    assert.equal(worker, createdWorkers[0]);
    assert.equal(createdWorkers[0]?.queueName, "dcrm.email.sync");
    assert.equal(typeof createdWorkers[0]?.processor, "function");
  });
});

function createSyncedTestRepositories() {
  const automationRepository = createInMemoryAutomationRepository();
  const crmRepository = createInMemoryCrmRepository({
    async isActiveEmailAccount(input) {
      const accounts = await automationRepository.emailAccounts.listEncrypted({ userId: input.userId });
      return accounts.some((account) => account.id === input.emailAccountId && account.enabled);
    },
  });
  return { automationRepository, crmRepository };
}

class FakeImapNetworkClient implements ImapNetworkClient {
  readonly passwordSeen: string;
  readonly messages: readonly ImapNetworkMessage[];
  readonly mailbox?: { readonly uidValidity: string };
  mailboxLocked: string | null = null;
  fetchRange: string | readonly number[] | null = null;
  loggedOut = false;

  constructor(passwordSeen: string, messages: readonly ImapNetworkMessage[], uidValidity: string | null = null) {
    this.passwordSeen = passwordSeen;
    this.messages = messages;
    this.mailbox = uidValidity ? { uidValidity } : undefined;
  }

  async connect() {}

  async getMailboxLock(mailbox: string) {
    this.mailboxLocked = mailbox;
    return { release() {} };
  }

  async *fetch(range: string | readonly number[]) {
    this.fetchRange = range;
    yield* this.messages;
  }

  async logout() {
    this.loggedOut = true;
  }
}

class RecordingWorker {
  readonly processor: (data: EmailSyncJobData) => Promise<EmailSyncJobResult>;
  readonly queueName: string;

  constructor(processor: (data: EmailSyncJobData) => Promise<EmailSyncJobResult>, queueName: string) {
    this.processor = processor;
    this.queueName = queueName;
  }
}

function rawImapMessage(input: { readonly uid: number; readonly messageId: string; readonly from: string }): ImapNetworkMessage {
  const source = Buffer.from(`From: Sender <${input.from}>\r\nTo: me@example.com\r\nMessage-ID: ${input.messageId}\r\nSubject: Production sync\r\nDate: Thu, 1 Jan 2026 11:00:00 +0000\r\n\r\nHello from production IMAP boundary.`, "utf8");
  return { uid: input.uid, source, internalDate: new Date("2026-01-01T11:00:00.000Z") };
}

function createMockImapClient(messages: readonly ImapEmailMessage[]): ImapMailboxClient {
  return {
    async fetchNewMessages() {
      return { messages, uidValidity: null };
    },
  };
}

function mockMessage(input: { readonly from: string; readonly messageId: string; readonly uid: string; readonly headers?: Readonly<Record<string, string>>; readonly inReplyTo?: string; readonly references?: readonly string[] }): ImapEmailMessage {
  return {
    uid: input.uid,
    messageId: input.messageId,
    from: { email: input.from, name: "Sender" },
    to: [{ email: "me@example.com" }],
    subject: "Project update",
    textBody: "Hello from the mocked IMAP boundary.",
    receivedAt: new Date("2026-01-01T11:00:00.000Z"),
    headers: input.headers ?? {},
    inReplyTo: input.inReplyTo,
    references: input.references,
  };
}

function createAccountInput(secretCrypto: SecretCrypto, now: Date) {
  return {
    userId: "user_1",
    name: "Work inbox",
    emailAddress: "me@example.com",
    imapHost: "imap.example.com",
    imapPort: 993,
    imapUsername: "me@example.com",
    encryptedImapPassword: secretCrypto.encrypt("imap-secret"),
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    smtpUsername: "me@example.com",
    encryptedSmtpPassword: secretCrypto.encrypt("smtp-secret"),
    enabled: true,
    now,
  };
}

function nextId(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}_${++index}`;
}

function createTaggingSecretCrypto(): SecretCrypto {
  return {
    encrypt: (plaintext) => ({ version: "dcrm.secret.v1", algorithm: "aes-256-gcm", encoding: "base64", ciphertext: Buffer.from(plaintext, "utf8").toString("base64"), iv: "test-iv", authTag: "test-tag" }) satisfies EncryptedSecretV1,
    decrypt: (encrypted) => Buffer.from(encrypted.ciphertext, "base64").toString("utf8"),
  };
}
