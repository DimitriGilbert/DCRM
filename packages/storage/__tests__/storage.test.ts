import { describe, it, expect, beforeEach } from "vitest";

import { LocalStorageBackend } from "../src/local";
import { S3StorageBackend } from "../src/s3";
import { StorageError } from "../src/types";

import type { StorageBackend } from "../src/types";

/**
 * Shared test suite that any StorageBackend implementation must pass.
 * Used for both local and mock-S3 backends.
 */
function backendSuite(
  name: string,
  createBackend: () => StorageBackend,
) {
  describe(name, () => {
    let backend: StorageBackend;

    beforeEach(() => {
      backend = createBackend();
    });

    it("stores and retrieves a file", async () => {
      const data = new TextEncoder().encode("hello world");
      const result = await backend.put("user1", "test/file.txt", data, "text/plain");

      expect(result.path).toBe("test/file.txt");
      expect(result.size).toBe(data.byteLength);
      expect(result.mimeType).toBe("text/plain");

      const retrieved = await backend.get("user1", "test/file.txt");
      expect(retrieved).toEqual(data);
    });

    it("reports existence correctly", async () => {
      const data = new TextEncoder().encode("data");
      expect(await backend.exists("user1", "a.txt")).toBe(false);

      await backend.put("user1", "a.txt", data, "text/plain");
      expect(await backend.exists("user1", "a.txt")).toBe(true);
    });

    it("deletes a file", async () => {
      const data = new TextEncoder().encode("temporary");
      await backend.put("user1", "del.txt", data, "text/plain");

      await backend.delete("user1", "del.txt");
      expect(await backend.exists("user1", "del.txt")).toBe(false);
    });

    it("throws NOT_FOUND when getting a missing file", async () => {
      await expect(backend.get("user1", "missing.txt")).rejects.toThrow(StorageError);
      await expect(backend.get("user1", "missing.txt")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("throws NOT_FOUND when deleting a missing file", async () => {
      await expect(backend.delete("user1", "missing.txt")).rejects.toThrow(StorageError);
      await expect(backend.delete("user1", "missing.txt")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("isolates files per user", async () => {
      const dataA = new TextEncoder().encode("user-a");
      const dataB = new TextEncoder().encode("user-b");

      await backend.put("userA", "shared.txt", dataA, "text/plain");
      await backend.put("userB", "shared.txt", dataB, "text/plain");

      const gotA = await backend.get("userA", "shared.txt");
      const gotB = await backend.get("userB", "shared.txt");

      expect(gotA).toEqual(dataA);
      expect(gotB).toEqual(dataB);
    });

    it("returns configured limits", () => {
      const limits = backend.getLimits();
      expect(limits.maxFileSize).toBeGreaterThan(0);
      // userQuota is either a positive number or null
      if (limits.userQuota !== null) {
        expect(limits.userQuota).toBeGreaterThan(0);
      } else {
        expect(limits.userQuota).toBeNull();
      }
    });

    it("rejects files exceeding maxFileSize", async () => {
      const limits = backend.getLimits();
      const oversized = new Uint8Array(limits.maxFileSize + 1);
      await expect(
        backend.put("user1", "big.bin", oversized, "application/octet-stream"),
      ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    });
  });
}

// ---------------------------------------------------------------------------
// Local backend tests using an in-memory fs mock
// ---------------------------------------------------------------------------

describe("LocalStorageBackend", () => {
  let memFs: Map<string, Uint8Array>;

  function createTestLocal(opts?: { maxSize?: number; userQuota?: number | null }): LocalStorageBackend {
    return new LocalStorageBackend({
      maxSize: opts?.maxSize ?? 1024 * 1024, // 1 MB default
      userQuota: opts?.userQuota ?? 10 * 1024 * 1024, // 10 MB default
      baseDir: "/tmp/dcrm-test",
      _fsOverride: memFs,
    });
  }

  beforeEach(() => {
    memFs = new Map();
  });

  backendSuite("LocalStorageBackend (in-memory)", createTestLocal);

  it("enforces user quota", async () => {
    // Use a dedicated backend with large maxFileSize but tight quota
    const backend = createTestLocal({ maxSize: 20 * 1024 * 1024, userQuota: 10 * 1024 * 1024 });
    // userQuota = 10 MB, write 6 MB then try 5 MB more
    const chunk = new Uint8Array(6 * 1024 * 1024);
    await backend.put("user1", "chunk1.bin", chunk, "application/octet-stream");

    const overQuota = new Uint8Array(5 * 1024 * 1024);
    await expect(
      backend.put("user1", "chunk2.bin", overQuota, "application/octet-stream"),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });
});

// ---------------------------------------------------------------------------
// S3 backend tests using a mock client
// ---------------------------------------------------------------------------

describe("S3StorageBackend (mocked)", () => {
  let s3Store: Map<string, Uint8Array>;
  let s3Sizes: Map<string, number>;

  function createMockS3(): StorageBackend {
    return new S3StorageBackend({
      maxSize: 1024 * 1024,
      userQuota: null,
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      _clientOverride: {
        send: async (command: unknown) => {
          const cmd = command as { __cmd: string; key: string; body?: Uint8Array; contentType?: string };
          const { __cmd: cmdName, key } = cmd;

          if (cmdName === "PutObject") {
            s3Store.set(key, cmd.body!);
            s3Sizes.set(key, cmd.body!.byteLength);
            return {};
          }
          if (cmdName === "GetObject") {
            const body = s3Store.get(key);
            if (!body) {
              const err = new Error("NotFound");
              err.name = "NoSuchKey";
              throw err;
            }
            return { body };
          }
          if (cmdName === "DeleteObject") {
            if (!s3Store.has(key)) {
              const err = new Error("NotFound");
              err.name = "NoSuchKey";
              throw err;
            }
            s3Store.delete(key);
            return {};
          }
          if (cmdName === "HeadObject") {
            if (!s3Store.has(key)) {
              const err = new Error("NotFound");
              err.name = "NotFound";
              throw err;
            }
            return { ContentLength: s3Sizes.get(key) ?? 0 };
          }
          return {};
        },
      },
    });
  }

  beforeEach(() => {
    s3Store = new Map();
    s3Sizes = new Map();
  });

  backendSuite("S3StorageBackend (mocked)", createMockS3);

  it("has null userQuota (unlimited)", () => {
    const backend = createMockS3();
    expect(backend.getLimits().userQuota).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Storage factory tests
// ---------------------------------------------------------------------------

describe("createStorage", () => {
  it("creates LocalStorageBackend when STORAGE_TYPE is local", async () => {
    const { createStorage } = await import("../src/storage");
    const backend = createStorage({ STORAGE_TYPE: "local" });
    expect(backend.name).toBe("local");
  });

  it("creates S3StorageBackend when STORAGE_TYPE is s3", async () => {
    const { createStorage } = await import("../src/storage");
    const backend = createStorage({
      STORAGE_TYPE: "s3",
      S3_ENDPOINT: "https://s3.example.com",
      S3_BUCKET: "my-bucket",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_REGION: "us-east-1",
    });
    expect(backend.name).toBe("s3");
  });
});
