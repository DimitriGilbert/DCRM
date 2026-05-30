import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createStorageService } from "./index.js";

describe("attachment storage service", () => {
  it("stores and reads attachment bytes through the local backend by default", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "dcrm-storage-"));
    const storage = createStorageService({ backend: "local", localPath: rootPath });

    try {
      const stored = await storage.put({ key: "user_1/attachment_1/contract.txt", content: Buffer.from("signed"), contentType: "text/plain" });
      const content = await storage.get(stored.key);
      const raw = await readFile(join(rootPath, "user_1", "attachment_1", "contract.txt"), "utf8");

      assert.equal(stored.backend, "local");
      assert.equal(stored.byteSize, 6);
      assert.equal(stored.contentType, "text/plain");
      assert.equal(content.toString("utf8"), "signed");
      assert.equal(raw, "signed");
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });
});
