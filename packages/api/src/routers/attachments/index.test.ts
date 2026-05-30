import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { createStorageService } from "../../storage/index.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";

describe("attachments tRPC API", () => {
  it("attaches a file to an owned client, stores metadata, and emits a file event", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    const attachment = await caller.attachments.create({
      targetType: "client",
      targetId: client.id,
      fileName: "contract.txt",
      contentType: "text/plain",
      byteSize: 6,
      checksum: "sha256:demo",
      contentBase64: Buffer.from("signed").toString("base64"),
      metadata: { source: "manual" },
    });

    assert.equal(attachment.userId, "user_1");
    assert.equal(attachment.targetType, "client");
    assert.equal(attachment.fileName, "contract.txt");
    assert.equal(attachment.byteSize, 6);
    assert.equal(attachment.metadata.source, "manual");
    assert.deepEqual(
      (await caller.attachments.listForTarget({ targetType: "client", targetId: client.id })).map((record) => record.id),
      [attachment.id],
    );
    assert.deepEqual(
      (await eventService.listForUser("user_1")).map((event) => event.type),
      ["client.created", "attachment.file_attached"],
    );
  });
});

function createTestContext(userId: string, crmRepository: CrmRepository, eventService: ReturnType<typeof createEventService>): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    crmRepository,
    eventService,
    session: null,
    storage: {
      service: createStorageService({ backend: "local", localPath: "/tmp/dcrm-attachment-test" }),
      maxAttachmentBytes: 25,
      userQuotaBytes: 1_000,
    },
  };
}
