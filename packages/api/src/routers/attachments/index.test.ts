import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventService, createInMemoryEventRepository } from "@DCRM/events";

import { createInMemoryCrmRepository } from "../../crm/repository.js";
import { createStorageService } from "../../storage/index.js";
import { appRouter } from "../index.js";

import type { Context } from "../../context.js";
import type { CrmRepository } from "../../crm/repository.js";
import type { StorageService } from "../../storage/index.js";

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

  it("rejects impossible base64 lengths before writing to storage", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const trackingStorage = createTrackingStorageService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService, { service: trackingStorage, maxAttachmentBytes: 25, userQuotaBytes: 1_000 }));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "contract.txt",
        byteSize: 1,
        contentBase64: "AAAAAAAA",
      }),
    );
    assert.equal(trackingStorage.putCount(), 0);
  });

  it("rejects encoded content beyond the configured max before writing to storage", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const trackingStorage = createTrackingStorageService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService, { service: trackingStorage, maxAttachmentBytes: 25, userQuotaBytes: 1_000 }));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "contract.txt",
        byteSize: 28,
        contentBase64: Buffer.alloc(28).toString("base64"),
      }),
    );
    assert.equal(trackingStorage.putCount(), 0);
  });

  it("rejects non-canonical padded base64 before writing to storage", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const trackingStorage = createTrackingStorageService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService, { service: trackingStorage, maxAttachmentBytes: 25, userQuotaBytes: 1_000 }));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "one-byte.bin",
        byteSize: 1,
        contentBase64: "AB==",
      }),
    );
    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "two-bytes.bin",
        byteSize: 2,
        contentBase64: "AAB=",
      }),
    );
    assert.equal(trackingStorage.putCount(), 0);
  });

  it("rejects unsafe content types and oversized metadata before writing to storage", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const trackingStorage = createTrackingStorageService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService, { service: trackingStorage, maxAttachmentBytes: 25, userQuotaBytes: 1_000 }));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "contract.txt",
        contentType: "text/plain\r\nx-bad: 1",
        byteSize: 6,
        contentBase64: Buffer.from("signed").toString("base64"),
      }),
      /content type/u,
    );
    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "contract.txt",
        contentType: "bad type",
        byteSize: 6,
        contentBase64: Buffer.from("signed").toString("base64"),
      }),
      /content type/u,
    );
    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "contract.txt",
        byteSize: 6,
        contentBase64: Buffer.from("signed").toString("base64"),
        metadata: { oversized: "x".repeat(9_000) },
      }),
      /metadata/u,
    );
    assert.equal(trackingStorage.putCount(), 0);
  });

  it("cleans up stored objects when atomic quota enforcement rejects persistence", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const trackingStorage = createTrackingStorageService();
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService, { service: trackingStorage, maxAttachmentBytes: 25, userQuotaBytes: 5 }));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "contract.txt",
        byteSize: 6,
        contentBase64: Buffer.from("signed").toString("base64"),
      }),
    );
    assert.equal(trackingStorage.storedKeyCount(), 0);
    assert.equal(trackingStorage.deleteCount(), 1);
  });

  it("rejects dot-segment attachment file names", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const eventService = createEventService({ repository: createInMemoryEventRepository(), idGenerator: () => "event_1" });
    const caller = appRouter.createCaller(createTestContext("user_1", crmRepository, eventService));
    const client = await caller.clients.create({ name: "Ada Lovelace" });

    await assert.rejects(
      caller.attachments.create({
        targetType: "client",
        targetId: client.id,
        fileName: "..",
        byteSize: 6,
        contentBase64: Buffer.from("signed").toString("base64"),
      }),
    );
  });

  it("enforces attachment user quota atomically in the repository", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const now = new Date("2026-05-30T00:00:00.000Z");
    await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Ada Lovelace" }, now });
    const fields = {
      targetType: "client" as const,
      targetId: "client_1",
      storageBackend: "local" as const,
      storageKey: "user_1/attachment/contract.txt",
      fileName: "contract.txt",
      contentType: "text/plain",
      byteSize: 6,
      checksum: undefined,
      metadata: undefined,
    };

    const results = await Promise.all([
      crmRepository.attachments.createWithinUserQuota({ id: "attachment_1", userId: "user_1", fields, now, userQuotaBytes: 10 }),
      crmRepository.attachments.createWithinUserQuota({ id: "attachment_2", userId: "user_1", fields: { ...fields, storageKey: "user_1/attachment-2/contract.txt" }, now, userQuotaBytes: 10 }),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await crmRepository.attachments.sumByteSizeForUser({ userId: "user_1" }), 6);
  });

  it("rejects repository attachment writes for missing and deleted targets", async () => {
    const crmRepository = createInMemoryCrmRepository();
    const now = new Date("2026-05-30T00:00:00.000Z");
    const client = await crmRepository.clients.create({ id: "client_1", userId: "user_1", fields: { name: "Ada Lovelace" }, now });
    await crmRepository.clients.setDeletedAt({ userId: "user_1", id: client.id, deletedAt: now, now });
    const fields = {
      targetType: "client" as const,
      targetId: client.id,
      storageBackend: "local" as const,
      storageKey: "user_1/attachment/contract.txt",
      fileName: "contract.txt",
      contentType: "text/plain",
      byteSize: 6,
      checksum: undefined,
      metadata: undefined,
    };

    await assert.rejects(crmRepository.attachments.create({ id: "attachment_1", userId: "user_1", fields, now }), /Client not found|Attachment target not found/u);
    await assert.rejects(crmRepository.attachments.createWithinUserQuota({ id: "attachment_2", userId: "user_1", fields, now, userQuotaBytes: 10 }), /Client not found|Attachment target not found/u);
    assert.equal(await crmRepository.attachments.sumByteSizeForUser({ userId: "user_1" }), 0);
  });
});

function createTestContext(userId: string, crmRepository: CrmRepository, eventService: ReturnType<typeof createEventService>, storage?: Context["storage"]): Context {
  return {
    auth: { kind: "session", user: { id: userId, email: `${userId}@example.com`, name: userId, image: null } },
    crmRepository,
    eventService,
    session: null,
    storage: storage ?? {
      service: createStorageService({ backend: "local", localPath: "/tmp/dcrm-attachment-test" }),
      maxAttachmentBytes: 25,
      userQuotaBytes: 1_000,
    },
  };
}

function createTrackingStorageService(): StorageService & { readonly putCount: () => number; readonly deleteCount: () => number; readonly storedKeyCount: () => number } {
  const objects = new Map<string, Buffer>();
  let putCount = 0;
  let deleteCount = 0;

  return {
    backend: "local",
    async put(input) {
      putCount += 1;
      objects.set(input.key, input.content);
      return { backend: "local", key: input.key, byteSize: input.content.byteLength, contentType: input.contentType ?? null };
    },
    async get(key) {
      const content = objects.get(key);
      if (!content) {
        throw new Error("Object not found.");
      }
      return content;
    },
    async delete(key) {
      deleteCount += 1;
      return objects.delete(key);
    },
    putCount() {
      return putCount;
    },
    deleteCount() {
      return deleteCount;
    },
    storedKeyCount() {
      return objects.size;
    },
  };
}
