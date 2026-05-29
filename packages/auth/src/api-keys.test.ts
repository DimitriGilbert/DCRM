import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApiKeyService, verifyApiKeyFromHeaders } from "./api-keys.js";

import type { ApiKeyRepository, StoredApiKey } from "./api-keys.js";

function createMemoryRepository() {
  const records: StoredApiKey[] = [];

  const repository: ApiKeyRepository = {
    async insertApiKey(input) {
      const stored: StoredApiKey = {
        ...input,
        createdAt: input.createdAt ?? new Date("2026-01-02T03:04:05.000Z"),
        lastUsedAt: null,
        expiresAt: input.expiresAt ?? null,
        updatedAt: input.createdAt ?? new Date("2026-01-02T03:04:05.000Z"),
        revokedAt: null,
      };
      records.push(stored);
      return stored;
    },
    async findApiKeysByPrefix(keyPrefix) {
      return records.filter((record) => record.keyPrefix === keyPrefix && record.revokedAt === null);
    },
    async markApiKeyUsed(id, lastUsedAt) {
      const record = records.find((candidate) => candidate.id === id);
      if (record) {
        record.lastUsedAt = lastUsedAt;
      }
      return lastUsedAt;
    },
  };

  return { records, repository };
}

describe("API keys", () => {
  it("creates a named API key that is shown once while only a hash is stored", async () => {
    const { records, repository } = createMemoryRepository();
    const service = createApiKeyService({
      repository,
      secret: "test-secret",
      generateId: () => "api-key-id",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      randomBytes: () => Buffer.from("a".repeat(32), "utf8"),
    });

    const created = await service.createApiKey({ userId: "user-1", name: "Scripts" });

    assert.equal(created.apiKey.id, "api-key-id");
    assert.equal(created.apiKey.userId, "user-1");
    assert.equal(created.apiKey.name, "Scripts");
    assert.equal(created.apiKey.createdAt.toISOString(), "2026-01-02T03:04:05.000Z");
    assert.equal(created.apiKey.lastUsedAt, null);
    assert.equal(created.key.startsWith("dcrm_"), true);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.keyPrefix, created.apiKey.keyPrefix);
    assert.notEqual(records[0]?.keyHash, created.key);
    assert.equal(JSON.stringify(records).includes(created.key), false);
  });

  it("verifies a presented API key and resolves the owning user context", async () => {
    const { records, repository } = createMemoryRepository();
    const service = createApiKeyService({
      repository,
      secret: "test-secret",
      generateId: () => "api-key-id",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      randomBytes: () => Buffer.from("b".repeat(32), "utf8"),
    });
    const created = await service.createApiKey({ userId: "user-1", name: "Scripts" });

    const verified = await verifyApiKeyFromHeaders(
      new Headers({ authorization: `Bearer ${created.key}` }),
      service,
    );

    assert.deepEqual(verified, {
      apiKey: {
        id: "api-key-id",
        name: "Scripts",
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
        lastUsedAt: new Date("2026-01-02T03:04:05.000Z"),
      },
      user: {
        id: "user-1",
      },
    });
    assert.equal(records[0]?.lastUsedAt?.toISOString(), "2026-01-02T03:04:05.000Z");
  });

  it("rejects a malformed Authorization header without falling back to x-api-key", async () => {
    const { records, repository } = createMemoryRepository();
    const service = createApiKeyService({
      repository,
      secret: "test-secret",
      generateId: () => "api-key-id",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      randomBytes: () => Buffer.from("c".repeat(32), "utf8"),
    });
    const created = await service.createApiKey({ userId: "user-1", name: "Scripts" });

    const verified = await verifyApiKeyFromHeaders(
      new Headers({
        authorization: "Basic malformed",
        "x-api-key": created.key,
      }),
      service,
    );

    assert.equal(verified, null);
    assert.equal(records[0]?.lastUsedAt, null);
  });
});
