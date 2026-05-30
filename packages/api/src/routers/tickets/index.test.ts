import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";
import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";
import type { EventService } from "@DCRM/events";

import { createInMemoryAutomationRepository } from "../../automation/repository.js";
import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { AutomationRepository } from "../../automation/repository.js";
import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";
import type { SmtpPlainTextClient, SmtpPlainTextMessage } from "../../email/send.js";

describe("tickets and exchanges tRPC API", () => {
  it("creates a user-scoped ticket inside an owned project with due date and emits a ticket.created event", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const dueAt = new Date("2026-06-15T12:00:00.000Z");

    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form", type: "bug", status: "open", priority: "urgent", dueAt });

    assert.equal(ticket.userId, "user_1");
    assert.equal(ticket.projectId, project.id);
    assert.equal(ticket.type, "bug");
    assert.equal(ticket.priority, "urgent");
    assert.deepEqual(ticket.dueAt, dueAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "ticket.created"],
    );
  });

  it("lists, updates status, and soft-deletes tickets without leaking another user's project tickets", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const client = await userOne.clients.create({ name: "Ada Lovelace" });
    const project = await userOne.projects.create({ clientId: client.id, name: "Website rebuild" });
    const otherClient = await userTwo.clients.create({ name: "Grace Hopper" });
    const otherProject = await userTwo.projects.create({ clientId: otherClient.id, name: "Compiler" });
    const ticket = await userOne.tickets.create({ projectId: project.id, title: "Fix contact form", type: "bug", priority: "urgent" });
    await userTwo.tickets.create({ projectId: otherProject.id, title: "Fix contact form", type: "bug", priority: "urgent" });

    assert.deepEqual(
      (await userOne.tickets.list({ projectId: project.id, search: "contact", status: "open", priority: "urgent" })).map((record) => record.id),
      [ticket.id],
    );
    assert.equal((await userOne.tickets.updateStatus({ id: ticket.id, status: "closed" })).status, "closed");
    await userOne.tickets.delete({ id: ticket.id });
    assert.deepEqual(await userOne.tickets.list({ projectId: project.id }), []);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "ticket.created", "ticket.status_changed", "ticket.deleted"],
    );
  });

  it("stores ticket comments as exchanges and exposes them through client, project, and ticket timelines", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });

    const comment = await caller.exchanges.addTicketComment({ ticketId: ticket.id, body: "I reproduced this on mobile.", visibility: "external" });

    assert.equal(comment.type, "comment");
    assert.equal(comment.clientId, client.id);
    assert.equal(comment.projectId, project.id);
    assert.equal(comment.ticketId, ticket.id);
    assert.deepEqual((await caller.exchanges.timeline({ clientId: client.id })).map((exchange) => exchange.id), [comment.id]);
    assert.deepEqual((await caller.exchanges.timeline({ projectId: project.id })).map((exchange) => exchange.id), [comment.id]);
    assert.deepEqual((await caller.exchanges.timeline({ ticketId: ticket.id })).map((exchange) => exchange.id), [comment.id]);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "ticket.created", "exchange.created", "ticket.updated"],
    );
  });

  it("keeps internal notes from being externally sendable", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(caller.exchanges.create({ clientId: client.id, type: "note", visibility: "external", body: "Private pricing concern" }), /Internal notes cannot be externally sendable/u);
    const note = await caller.exchanges.create({ clientId: client.id, type: "note", body: "Private pricing concern" });

    assert.equal(note.visibility, "internal");
  });

  it("keeps exchanges internally visible when updating an external exchange into a note", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const exchange = await caller.exchanges.create({ clientId: client.id, type: "email", visibility: "external", body: "Client-visible message" });

    const note = await caller.exchanges.update({ id: exchange.id, type: "note" });

    assert.equal(note.type, "note");
    assert.equal(note.visibility, "internal");
  });

  it("emails external ticket comments to the client through SMTP and records threading headers", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const automationRepository = createInMemoryAutomationRepository();
    const eventService = createTestEventService();
    const secretCrypto = createTaggingSecretCrypto();
    const sentMessages: SmtpPlainTextMessage[] = [];
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, new Date("2026-01-01T12:00:00.000Z")));
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService, { automationRepository, secretCrypto, smtpClient: createRecordingSmtpClient(sentMessages, "<sent@example.test>") }));
    const client = await caller.clients.create({ name: "Ada Lovelace", email: "ada@example.test" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });

    const comment = await caller.exchanges.addTicketComment({ ticketId: ticket.id, body: "Please try the form again.", visibility: "external", emailToClient: true });

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.headers["x-dcrm-sent"], "true");
    assert.equal(comment.externalMessageId, "<sent@example.test>");
  });

  it("emits ticket comment events even when optional email sending fails", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const automationRepository = createInMemoryAutomationRepository();
    const eventService = createTestEventService();
    const secretCrypto = createTaggingSecretCrypto();
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, new Date("2026-01-01T12:00:00.000Z")));
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService, { automationRepository, secretCrypto, smtpClient: createFailingSmtpClient() }));
    const client = await caller.clients.create({ name: "Ada Lovelace", email: "ada@example.test" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });

    await assert.rejects(caller.exchanges.addTicketComment({ ticketId: ticket.id, body: "Please try the form again.", visibility: "external", emailToClient: true }), /SMTP unavailable/u);
    const exchanges = await crmRepository.exchanges.list({ userId: "user_1", type: "comment" });

    assert.equal(exchanges.length, 1);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "ticket.created", "exchange.created", "ticket.updated"],
    );
  });

  it("does not email internal ticket comments from the ticket comment API", async () => {
    const sentMessages: SmtpPlainTextMessage[] = [];
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService(), { smtpClient: createRecordingSmtpClient(sentMessages, "<sent@example.test>") }));
    const client = await caller.clients.create({ name: "Ada Lovelace", email: "ada@example.test" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });

    await assert.rejects(caller.exchanges.addTicketComment({ ticketId: ticket.id, body: "Private diagnosis.", visibility: "internal", emailToClient: true }), /Only external ticket comments can be emailed to clients/u);
    assert.equal(sentMessages.length, 0);
  });
});

function createTestContext(userId: string, crmRepository: CrmRepository, eventService: EventService, options: { readonly automationRepository?: AutomationRepository; readonly secretCrypto?: SecretCrypto; readonly smtpClient?: SmtpPlainTextClient } = {}): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    automationRepository: options.automationRepository,
    crmRepository,
    eventService,
    secretCrypto: options.secretCrypto,
    session: null,
    smtpClient: options.smtpClient,
  };
}

function createTestEventService(): EventService {
  let nextId = 0;
  return createEventService({
    repository: createInMemoryEventRepository(),
    idGenerator: () => {
      nextId += 1;
      return `event_${nextId}`;
    },
  });
}

function createRecordingSmtpClient(messages: SmtpPlainTextMessage[], messageId: string): SmtpPlainTextClient {
  return {
    async sendPlainText(input) {
      messages.push(input.message);
      return { messageId };
    },
  };
}

function createFailingSmtpClient(): SmtpPlainTextClient {
  return {
    async sendPlainText() {
      throw new Error("SMTP unavailable");
    },
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

function createTaggingSecretCrypto(): SecretCrypto {
  return {
    encrypt: (plaintext) => ({ version: "dcrm.secret.v1", algorithm: "aes-256-gcm", encoding: "base64", ciphertext: Buffer.from(plaintext, "utf8").toString("base64"), iv: "test-iv", authTag: "test-tag" }) satisfies EncryptedSecretV1,
    decrypt: (encrypted) => Buffer.from(encrypted.ciphertext, "base64").toString("utf8"),
  };
}
