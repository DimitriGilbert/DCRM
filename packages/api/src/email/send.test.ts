import assert from "node:assert/strict";
import net from "node:net";
import { describe, it } from "node:test";

import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";

import { createInMemoryAutomationRepository } from "../automation/repository.js";
import { createInMemoryCrmRepository } from "../crm/repository.js";
import { createNodeSmtpPlainTextClient } from "./smtp.js";
import { createTicketCommentEmailSender } from "./send.js";

import type { CrmRepository } from "../crm/repository.js";
import type { SmtpPlainTextClient, SmtpPlainTextMessage } from "./send.js";

describe("SMTP ticket comment email sender", () => {
  it("sends plain-text external ticket comments with loop-prevention and stores the message id", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const crmRepository = createInMemoryCrmRepository();
    const automationRepository = createInMemoryAutomationRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const sentMessages: SmtpPlainTextMessage[] = [];
    const smtpClient = createRecordingSmtpClient(sentMessages, "<smtp-1@example.test>");
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme", email: "client@acme.test" }, now });
    const project = await crmRepository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: client.id, name: "Support" }, now });
    const ticket = await crmRepository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: project.id, title: "Broken form" }, now });
    const comment = await crmRepository.exchanges.create({ id: "exchange_1", userId: "user_1", fields: { clientId: client.id, projectId: project.id, ticketId: ticket.id, type: "comment", visibility: "external", body: "I shipped a fix." }, now });

    const sender = createTicketCommentEmailSender({ automationRepository, crmRepository, secretCrypto, smtpClient, idGenerator: () => "msg_1" });
    const result = await sender({ userId: "user_1", exchangeId: comment.id, now });

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.text, "I shipped a fix.");
    assert.deepEqual(sentMessages[0]?.to, ["client@acme.test"]);
    assert.equal(sentMessages[0]?.headers["x-dcrm-sent"], "true");
    assert.equal(result.messageId, "<smtp-1@example.test>");
    assert.equal(result.exchange.externalMessageId, "<smtp-1@example.test>");
  });

  it("rejects internal ticket comments before reaching SMTP", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const crmRepository = createInMemoryCrmRepository();
    const automationRepository = createInMemoryAutomationRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const sentMessages: SmtpPlainTextMessage[] = [];
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme", email: "client@acme.test" }, now });
    const project = await crmRepository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: client.id, name: "Support" }, now });
    const ticket = await crmRepository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: project.id, title: "Broken form" }, now });
    const comment = await crmRepository.exchanges.create({ id: "exchange_1", userId: "user_1", fields: { clientId: client.id, projectId: project.id, ticketId: ticket.id, type: "comment", visibility: "internal", body: "Private diagnosis." }, now });
    const sender = createTicketCommentEmailSender({ automationRepository, crmRepository, secretCrypto, smtpClient: createRecordingSmtpClient(sentMessages, "<smtp-1@example.test>") });

    await assert.rejects(sender({ userId: "user_1", exchangeId: comment.id, now }), /Internal ticket comments cannot be sent externally/u);
    assert.equal(sentMessages.length, 0);
  });

  it("does not send a ticket comment email again after sent metadata is persisted", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const crmRepository = createInMemoryCrmRepository();
    const automationRepository = createInMemoryAutomationRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const sentMessages: SmtpPlainTextMessage[] = [];
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme", email: "client@acme.test" }, now });
    const project = await crmRepository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: client.id, name: "Support" }, now });
    const ticket = await crmRepository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: project.id, title: "Broken form" }, now });
    const comment = await crmRepository.exchanges.create({ id: "exchange_1", userId: "user_1", fields: { clientId: client.id, projectId: project.id, ticketId: ticket.id, type: "comment", visibility: "external", body: "I shipped a fix." }, now });
    const sender = createTicketCommentEmailSender({ automationRepository, crmRepository, secretCrypto, smtpClient: createRecordingSmtpClient(sentMessages, "<smtp-1@example.test>"), idGenerator: () => "msg_1" });

    const firstResult = await sender({ userId: "user_1", exchangeId: comment.id, now });
    const retryResult = await sender({ userId: "user_1", exchangeId: comment.id, now });

    assert.equal(sentMessages.length, 1);
    assert.equal(firstResult.messageId, "<smtp-1@example.test>");
    assert.equal(retryResult.messageId, "<smtp-1@example.test>");
  });

  it("does not send a ticket comment email again when SMTP sent metadata exists without external message id", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const crmRepository = createInMemoryCrmRepository();
    const automationRepository = createInMemoryAutomationRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const sentMessages: SmtpPlainTextMessage[] = [];
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme", email: "client@acme.test" }, now });
    const project = await crmRepository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: client.id, name: "Support" }, now });
    const ticket = await crmRepository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: project.id, title: "Broken form" }, now });
    const comment = await crmRepository.exchanges.create({
      id: "exchange_1",
      userId: "user_1",
      fields: {
        clientId: client.id,
        projectId: project.id,
        ticketId: ticket.id,
        type: "comment",
        visibility: "external",
        body: "I shipped a fix.",
        metadata: { smtp: { sentAt: now.toISOString(), messageId: "<smtp-persisted@example.test>", headers: { "x-dcrm-sent": "true" } } },
      },
      now,
    });
    assert.equal(comment.externalMessageId, null);
    const sender = createTicketCommentEmailSender({ automationRepository, crmRepository, secretCrypto, smtpClient: createRecordingSmtpClient(sentMessages, "<smtp-1@example.test>"), idGenerator: () => "msg_1" });

    const result = await sender({ userId: "user_1", exchangeId: comment.id, now });

    assert.equal(sentMessages.length, 0);
    assert.equal(result.messageId, "<smtp-persisted@example.test>");
    assert.equal(result.exchange.externalMessageId, null);
  });

  it("does not send again after SMTP acceptance when post-send persistence fails", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const baseCrmRepository = createInMemoryCrmRepository();
    const crmRepository = failAcceptedSmtpPersistence(baseCrmRepository);
    const automationRepository = createInMemoryAutomationRepository();
    const secretCrypto = createTaggingSecretCrypto();
    const sentMessages: SmtpPlainTextMessage[] = [];
    await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now));
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme", email: "client@acme.test" }, now });
    const project = await crmRepository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: client.id, name: "Support" }, now });
    const ticket = await crmRepository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: project.id, title: "Broken form" }, now });
    const comment = await crmRepository.exchanges.create({ id: "exchange_1", userId: "user_1", fields: { clientId: client.id, projectId: project.id, ticketId: ticket.id, type: "comment", visibility: "external", body: "I shipped a fix." }, now });
    const sender = createTicketCommentEmailSender({ automationRepository, crmRepository, secretCrypto, smtpClient: createRecordingSmtpClient(sentMessages, "<smtp-1@example.test>") });

    await assert.rejects(sender({ userId: "user_1", exchangeId: comment.id, now }), /simulated persistence failure/u);
    const retryResult = await sender({ userId: "user_1", exchangeId: comment.id, now });

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.messageId, "<dcrm-exchange_1@dcrm.local>");
    assert.equal(retryResult.messageId, "<dcrm-exchange_1@dcrm.local>");
  });

  it("sends through the production SMTP client using decrypted saved account settings without an injected test client", async () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const smtpServer = await createLocalSmtpServer({ advertiseAuth: false });
    try {
      const crmRepository = createInMemoryCrmRepository();
      const automationRepository = createInMemoryAutomationRepository();
      const secretCrypto = createTaggingSecretCrypto();
      await automationRepository.emailAccounts.upsertEncrypted(createAccountInput(secretCrypto, now, { smtpHost: "127.0.0.1", smtpPort: smtpServer.port, smtpUsername: "", smtpPassword: "" }));
      const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Acme", email: "client@acme.test" }, now });
      const project = await crmRepository.projects.create({ id: "project_1", userId: "user_1", fields: { clientId: client.id, name: "Support" }, now });
      const ticket = await crmRepository.tickets.create({ id: "ticket_1", userId: "user_1", fields: { projectId: project.id, title: "Broken form" }, now });
      const comment = await crmRepository.exchanges.create({ id: "exchange_1", userId: "user_1", fields: { clientId: client.id, projectId: project.id, ticketId: ticket.id, type: "comment", visibility: "external", body: "Production boundary send." }, now });
      const sender = createTicketCommentEmailSender({ automationRepository, crmRepository, secretCrypto, idGenerator: () => "msg_1" });

      const result = await sender({ userId: "user_1", exchangeId: comment.id, now });

      assert.equal(result.messageId, "<queued@local.test>");
      assert.equal(smtpServer.sessions.length, 1);
      assert.equal(smtpServer.sessions[0]?.authenticatedAs, null);
      assert.equal(smtpServer.sessions[0]?.password, null);
      assert.equal(smtpServer.sessions[0]?.message.includes("Production boundary send."), true);
      assert.equal(smtpServer.sessions[0]?.message.includes("x-dcrm-sent: true"), true);
    } finally {
      await smtpServer.close();
    }
  });

  it("rejects authenticated SMTP when a plaintext server lacks STARTTLS", async () => {
    const smtpServer = await createLocalSmtpServer({ advertiseAuth: true });
    try {
      const smtpClient = createNodeSmtpPlainTextClient();

      await assert.rejects(
        smtpClient.sendPlainText({
          account: { host: "127.0.0.1", port: smtpServer.port, username: "me@example.com", password: "smtp-secret", fromEmail: "me@example.com", fromName: "Work inbox" },
          message: { from: "me@example.com", to: ["client@acme.test"], subject: "Re: Broken form", text: "Do not leak credentials.", headers: { "x-dcrm-sent": "true" }, messageId: "<dcrm-msg_1@dcrm.local>" },
        }),
        /TLS or STARTTLS is required/u,
      );

      assert.equal(smtpServer.sessions.length, 1);
      assert.equal(smtpServer.sessions[0]?.authenticatedAs, null);
      assert.equal(smtpServer.sessions[0]?.password, null);
      assert.equal(smtpServer.sessions[0]?.message, "");
    } finally {
      await smtpServer.close();
    }
  });

  it("settles pending SMTP reads when the server closes cleanly", async () => {
    const server = net.createServer((socket) => {
      socket.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert(typeof address === "object" && address !== null);
    try {
      const smtpClient = createNodeSmtpPlainTextClient();

      await assert.rejects(
        smtpClient.sendPlainText({
          account: { host: "127.0.0.1", port: address.port, username: "", password: "", fromEmail: "me@example.com", fromName: "Work inbox" },
          message: { from: "me@example.com", to: ["client@acme.test"], subject: "Re: Broken form", text: "Hello.", headers: { "x-dcrm-sent": "true" }, messageId: "<dcrm-msg_1@dcrm.local>" },
        }),
        /SMTP connection (?:ended|closed)/u,
      );
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

function createRecordingSmtpClient(messages: SmtpPlainTextMessage[], messageId: string): SmtpPlainTextClient {
  return {
    async sendPlainText(input) {
      messages.push(input.message);
      return { messageId };
    },
  };
}

function failAcceptedSmtpPersistence(repository: CrmRepository): CrmRepository {
  return {
    ...repository,
    exchanges: {
      ...repository.exchanges,
      async update(input) {
        if (input.fields.externalMessageId !== undefined) {
          throw new Error("simulated persistence failure");
        }
        return repository.exchanges.update(input);
      },
    },
  };
}

function createAccountInput(secretCrypto: SecretCrypto, now: Date, overrides: { readonly smtpHost?: string; readonly smtpPort?: number; readonly smtpUsername?: string; readonly smtpPassword?: string } = {}) {
  return {
    userId: "user_1",
    name: "Work inbox",
    emailAddress: "me@example.com",
    imapHost: "imap.example.com",
    imapPort: 993,
    imapUsername: "me@example.com",
    encryptedImapPassword: secretCrypto.encrypt("imap-secret"),
    smtpHost: overrides.smtpHost ?? "smtp.example.com",
    smtpPort: overrides.smtpPort ?? 465,
    smtpUsername: overrides.smtpUsername ?? "me@example.com",
    encryptedSmtpPassword: secretCrypto.encrypt(overrides.smtpPassword ?? "smtp-secret"),
    enabled: true,
    now,
  };
}

async function createLocalSmtpServer(options: { readonly advertiseAuth: boolean } = { advertiseAuth: true }): Promise<{ readonly port: number; readonly sessions: SmtpSession[]; readonly close: () => Promise<void> }> {
  const sessions: SmtpSession[] = [];
  const server = net.createServer((socket) => {
    const session: MutableSmtpSession = { authenticatedAs: null, password: null, message: "" };
    sessions.push(session);
    let buffer = "";
    let collectingData = false;
    socket.write("220 local.test ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\r\n")) {
        const lineEnd = buffer.indexOf("\r\n");
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        if (collectingData) {
          if (line === ".") {
            collectingData = false;
            socket.write("250 2.0.0 queued as <queued@local.test>\r\n");
          } else {
            session.message += `${line}\r\n`;
          }
          continue;
        }
        if (line.startsWith("EHLO ")) {
          socket.write(options.advertiseAuth ? "250-local.test\r\n250 AUTH PLAIN LOGIN\r\n" : "250 local.test\r\n");
        } else if (line.startsWith("AUTH PLAIN ")) {
          const decoded = Buffer.from(line.slice("AUTH PLAIN ".length), "base64").toString("utf8").split("\0");
          session.authenticatedAs = decoded[1] ?? null;
          session.password = decoded[2] ?? null;
          socket.write("235 2.7.0 authenticated\r\n");
        } else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) {
          socket.write("250 2.1.0 ok\r\n");
        } else if (line === "DATA") {
          collectingData = true;
          socket.write("354 end with dot\r\n");
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("250 ok\r\n");
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(typeof address === "object" && address !== null);
  return { port: address.port, sessions, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

type SmtpSession = {
  readonly authenticatedAs: string | null;
  readonly password: string | null;
  readonly message: string;
};

type MutableSmtpSession = {
  authenticatedAs: string | null;
  password: string | null;
  message: string;
};

function createTaggingSecretCrypto(): SecretCrypto {
  return {
    encrypt: (plaintext) => ({ version: "dcrm.secret.v1", algorithm: "aes-256-gcm", encoding: "base64", ciphertext: Buffer.from(plaintext, "utf8").toString("base64"), iv: "test-iv", authTag: "test-tag" }) satisfies EncryptedSecretV1,
    decrypt: (encrypted) => Buffer.from(encrypted.ciphertext, "base64").toString("utf8"),
  };
}
