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

  it("rejects direct deleted ticket access and keeps repeated delete stable", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });

    const deleted = await caller.tickets.delete({ id: ticket.id });
    const repeatedDelete = await caller.tickets.delete({ id: ticket.id });

    await assert.rejects(caller.tickets.get({ id: ticket.id }), /Ticket not found/u);
    await assert.rejects(caller.tickets.update({ id: ticket.id, title: "Deleted ticket" }), /Ticket not found/u);
    await assert.rejects(caller.tickets.updateStatus({ id: ticket.id, status: "closed" }), /Ticket not found/u);
    assert.deepEqual(repeatedDelete.deletedAt, deleted.deletedAt);
    assert.deepEqual(repeatedDelete.updatedAt, deleted.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "ticket.created", "ticket.deleted"],
    );
  });

  it("keeps repeated ticket status updates from changing closedAt or emitting events", async () => {
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });

    const closed = await caller.tickets.updateStatus({ id: ticket.id, status: "closed" });
    const repeatedClosed = await caller.tickets.updateStatus({ id: ticket.id, status: "closed" });

    assert.deepEqual(repeatedClosed.closedAt, closed.closedAt);
    assert.deepEqual(repeatedClosed.updatedAt, closed.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "project.created", "ticket.created", "ticket.status_changed"],
    );
  });

  it("normalizes ticket status and closedAt consistency on create and update", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), createTestEventService()));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const suppliedClosedAt = new Date("2026-06-15T12:00:00.000Z");

    const openTicket = await caller.tickets.create({ projectId: project.id, title: "Open ticket", status: "open", closedAt: suppliedClosedAt });
    const closedTicket = await caller.tickets.create({ projectId: project.id, title: "Closed ticket", status: "closed" });
    const reopenedTicket = await caller.tickets.update({ id: closedTicket.id, status: "open", closedAt: suppliedClosedAt });
    const reclosedTicket = await caller.tickets.update({ id: reopenedTicket.id, status: "closed", closedAt: null });

    assert.equal(openTicket.status, "open");
    assert.equal(openTicket.closedAt, null);
    assert.equal(closedTicket.status, "closed");
    assert.ok(closedTicket.closedAt instanceof Date);
    assert.equal(reopenedTicket.status, "open");
    assert.equal(reopenedTicket.closedAt, null);
    assert.equal(reclosedTicket.status, "closed");
    assert.ok(reclosedTicket.closedAt instanceof Date);
  });

  it("rejects ticket parent project IDs that are missing, deleted, or owned by another user", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const client = await userOne.clients.create({ name: "Ada Lovelace" });
    const activeProject = await userOne.projects.create({ clientId: client.id, name: "Active project" });
    const deletedProject = await userOne.projects.create({ clientId: client.id, name: "Deleted project" });
    const foreignClient = await userTwo.clients.create({ name: "Grace Hopper" });
    const foreignProject = await userTwo.projects.create({ clientId: foreignClient.id, name: "Foreign project" });
    const ticket = await userOne.tickets.create({ projectId: activeProject.id, title: "Owned ticket" });
    await userOne.projects.delete({ id: deletedProject.id });

    await assert.rejects(userOne.tickets.create({ projectId: "missing_project", title: "Missing parent" }), /Project not found/u);
    await assert.rejects(userOne.tickets.create({ projectId: deletedProject.id, title: "Deleted parent" }), /Project not found/u);
    await assert.rejects(userOne.tickets.create({ projectId: foreignProject.id, title: "Foreign parent" }), /Project not found/u);
    await assert.rejects(userOne.tickets.update({ id: ticket.id, projectId: deletedProject.id }), /Project not found/u);
    await assert.rejects(userOne.tickets.update({ id: ticket.id, projectId: foreignProject.id }), /Project not found/u);
  });

  it("hides active tickets under deleted projects unless stale parents are requested explicitly", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });
    await caller.projects.delete({ id: project.id });

    await assert.rejects(caller.tickets.get({ id: ticket.id }), /Ticket not found/u);
    await assert.rejects(caller.tickets.update({ id: ticket.id, title: "Still broken" }), /Ticket not found/u);
    await assert.rejects(caller.tickets.updateStatus({ id: ticket.id, status: "closed" }), /Ticket not found/u);
    await assert.rejects(caller.tickets.delete({ id: ticket.id }), /Ticket not found/u);
    assert.deepEqual(await caller.tickets.list({}), []);
    assert.deepEqual(
      (await caller.tickets.list({ includeInactiveParent: true })).map((record) => record.id),
      [ticket.id],
    );
    assert.equal((await caller.tickets.get({ id: ticket.id, includeInactiveParent: true })).id, ticket.id);
  });

  it("hides active tickets under projects whose client is deleted unless stale parents are requested explicitly", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const project = await caller.projects.create({ clientId: client.id, name: "Website rebuild" });
    const ticket = await caller.tickets.create({ projectId: project.id, title: "Fix contact form" });
    await caller.clients.delete({ id: client.id });

    await assert.rejects(caller.tickets.get({ id: ticket.id }), /Ticket not found/u);
    await assert.rejects(caller.tickets.update({ id: ticket.id, title: "Still broken" }), /Ticket not found/u);
    await assert.rejects(caller.tickets.updateStatus({ id: ticket.id, status: "closed" }), /Ticket not found/u);
    await assert.rejects(caller.tickets.delete({ id: ticket.id }), /Ticket not found/u);
    assert.deepEqual(await caller.tickets.list({}), []);
    assert.deepEqual(
      (await caller.tickets.list({ includeInactiveParent: true })).map((record) => record.id),
      [ticket.id],
    );
    assert.equal((await caller.tickets.get({ id: ticket.id, includeInactiveParent: true })).id, ticket.id);
  });

  it("rejects moving tickets that already have exchanges attached", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const firstClient = await caller.clients.create({ name: "Ada Lovelace" });
    const secondClient = await caller.clients.create({ name: "Charles Babbage" });
    const firstProject = await caller.projects.create({ clientId: firstClient.id, name: "Website rebuild" });
    const secondProject = await caller.projects.create({ clientId: secondClient.id, name: "Research" });
    const ticket = await caller.tickets.create({ projectId: firstProject.id, title: "Fix contact form" });
    await caller.exchanges.addTicketComment({ ticketId: ticket.id, body: "I reproduced this on mobile.", visibility: "external" });

    await assert.rejects(caller.tickets.update({ id: ticket.id, projectId: secondProject.id }), /Ticket project cannot be changed/u);
    assert.equal((await caller.tickets.get({ id: ticket.id })).projectId, firstProject.id);
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

  it("rejects exchange parent IDs that are missing, deleted, mismatched, or owned by another user", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createTestEventService();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository, eventService));
    const client = await userOne.clients.create({ name: "Ada Lovelace" });
    const otherClient = await userOne.clients.create({ name: "Charles Babbage" });
    const project = await userOne.projects.create({ clientId: client.id, name: "Active project" });
    const otherProject = await userOne.projects.create({ clientId: otherClient.id, name: "Other project" });
    const deletedProject = await userOne.projects.create({ clientId: client.id, name: "Deleted project" });
    const ticket = await userOne.tickets.create({ projectId: project.id, title: "Owned ticket" });
    const foreignClient = await userTwo.clients.create({ name: "Grace Hopper" });
    const foreignProject = await userTwo.projects.create({ clientId: foreignClient.id, name: "Foreign project" });
    await userOne.projects.delete({ id: deletedProject.id });

    await assert.rejects(userOne.exchanges.create({ clientId: foreignClient.id, type: "note", body: "Foreign client" }), /Client not found/u);
    await assert.rejects(userOne.exchanges.create({ projectId: deletedProject.id, type: "note", body: "Deleted project" }), /Project not found/u);
    await assert.rejects(userOne.exchanges.create({ projectId: foreignProject.id, type: "note", body: "Foreign project" }), /Project not found/u);
    await assert.rejects(userOne.exchanges.create({ clientId: otherClient.id, projectId: project.id, type: "note", body: "Mismatched client" }), /Exchange client does not match project client/u);
    await assert.rejects(userOne.exchanges.update({ id: (await userOne.exchanges.create({ clientId: client.id, type: "note", body: "Owned exchange" })).id, projectId: otherProject.id, ticketId: ticket.id }), /Exchange project does not match ticket project/u);
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

  it("rejects deleted exchange reads and updates while keeping repeated delete stable", async () => {
    const eventService = createTestEventService();
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });
    const exchange = await caller.exchanges.create({ clientId: client.id, type: "note", body: "Private pricing concern" });

    const deleted = await caller.exchanges.delete({ id: exchange.id });
    const repeatedDelete = await caller.exchanges.delete({ id: exchange.id });

    await assert.rejects(caller.exchanges.get({ id: exchange.id }), /Exchange not found/u);
    await assert.rejects(caller.exchanges.update({ id: exchange.id, body: "Changed" }), /Exchange not found/u);
    assert.deepEqual(repeatedDelete.deletedAt, deleted.deletedAt);
    assert.deepEqual(repeatedDelete.updatedAt, deleted.updatedAt);
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "exchange.created", "exchange.deleted"],
    );
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
