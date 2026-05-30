import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";

import { createInMemoryAutomationRepository } from "../../automation/repository.js";
import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { appRouter } from "../index.js";

import type { AutomationRepository } from "../../automation/repository.js";
import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("email account and authorized sender API", () => {
  it("stores IMAP and SMTP credentials encrypted and returns only safe account metadata", async () => {
    const automationRepository = createInMemoryAutomationRepository();
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository(), automationRepository, createTaggingSecretCrypto()));

    const saved = await caller.email.upsertAccount({
      name: "Work inbox",
      emailAddress: "me@example.com",
      imapHost: "imap.example.com",
      imapPort: 993,
      imapUsername: "me@example.com",
      imapPassword: "imap-secret",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpUsername: "me@example.com",
      smtpPassword: "smtp-secret",
      enabled: true,
    });

    const listed = await caller.email.listAccounts();
    const encrypted = await automationRepository.emailAccounts.listEncrypted({ userId: "user_1" });

    assert.equal(saved.hasImapPassword, true);
    assert.equal(saved.hasSmtpPassword, true);
    assert.deepEqual(listed.map((account) => account.id), [saved.id]);
    assert.equal(JSON.stringify(saved).includes("imap-secret"), false);
    assert.equal(JSON.stringify(listed).includes("smtp-secret"), false);
    assert.equal(JSON.stringify(encrypted).includes("imap-secret"), false);
    assert.equal(JSON.stringify(encrypted).includes(Buffer.from("smtp-secret", "utf8").toString("base64")), true);
  });

  it("matches exact authorized client email addresses case-insensitively", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository));
    const client = await caller.clients.create({ name: "Ada", email: "ada@example.com" });
    await caller.email.addClientAuthorizedEmail({ clientId: client.id, pattern: "Founder@Example.com" });

    const match = await caller.email.matchSender({ sender: "founder@example.com" });

    assert.equal(match.status, "matched");
    assert.equal(match.clientId, client.id);
    assert.equal(match.pattern, "founder@example.com");
  });

  it("matches wildcard domain patterns and reports unmatched senders without failing", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const userOne = appRouter.createCaller(createTestContext("user_1", crmRepository));
    const userTwo = appRouter.createCaller(createTestContext("user_2", crmRepository));
    const client = await userOne.clients.create({ name: "Acme" });
    await userOne.email.addClientAuthorizedEmail({ clientId: client.id, pattern: "*@acme.test" });

    const wildcardMatch = await userOne.email.matchSender({ sender: "ops@acme.test" });
    const unmatched = await userOne.email.matchSender({ sender: "stranger@example.test" });
    const otherUser = await userTwo.email.matchSender({ sender: "ops@acme.test" });

    assert.deepEqual(wildcardMatch, { status: "matched", clientId: client.id, pattern: "*@acme.test" });
    assert.deepEqual(unmatched, { status: "unmatched", sender: "stranger@example.test" });
    assert.deepEqual(otherUser, { status: "unmatched", sender: "ops@acme.test" });
  });

  it("rejects IMAP credentials on ports without implicit TLS or STARTTLS", async () => {
    const caller = appRouter.createCaller(createTestContext("user_1", createInMemoryCrmRepository()));

    await assert.rejects(
      caller.email.upsertAccount({
        name: "Work inbox",
        emailAddress: "me@example.com",
        imapHost: "imap.example.com",
        imapPort: 110,
        imapUsername: "me@example.com",
        imapPassword: "imap-secret",
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        smtpUsername: "me@example.com",
        smtpPassword: "smtp-secret",
        enabled: true,
      }),
      /TLS or STARTTLS is required/u,
    );
  });

  it("rejects authorized sender patterns that overlap another client", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository));
    const acme = await caller.clients.create({ name: "Acme" });
    const beta = await caller.clients.create({ name: "Beta" });
    await caller.email.addClientAuthorizedEmail({ clientId: acme.id, pattern: "*@acme.test" });

    await assert.rejects(caller.email.addClientAuthorizedEmail({ clientId: beta.id, pattern: "owner@acme.test" }), /overlaps another client/u);
  });
});

function createTestContext(userId: string, crmRepository: CrmRepository, automationRepository: AutomationRepository = createInMemoryAutomationRepository(), secretCrypto: SecretCrypto = createTaggingSecretCrypto()): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    automationRepository,
    crmRepository,
    eventService: createEventService({ repository: createInMemoryEventRepository() }),
    secretCrypto,
    session: null,
  };
}

function createTaggingSecretCrypto(): SecretCrypto {
  return {
    encrypt: (plaintext) => ({
      version: "dcrm.secret.v1",
      algorithm: "aes-256-gcm",
      encoding: "base64",
      ciphertext: Buffer.from(plaintext, "utf8").toString("base64"),
      iv: "test-iv",
      authTag: "test-tag",
    }) satisfies EncryptedSecretV1,
    decrypt: (encrypted) => Buffer.from(encrypted.ciphertext, "base64").toString("utf8"),
  };
}
