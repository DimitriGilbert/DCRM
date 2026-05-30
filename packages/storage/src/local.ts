import type { StorageBackend, StoredFile, StorageLimits } from "./types";

import { StorageError } from "./types";

export interface LocalStorageOptions {
  /** Maximum single file size in bytes. */
  maxSize: number;
  /** Per-user storage quota in bytes, or null for unlimited. */
  userQuota: number | null;
  /** Base directory for file storage. */
  baseDir: string;
  /**
   * Internal: in-memory fs override for testing.
   * When provided, all file operations use this Map instead of the real fs.
   */
  _fsOverride?: Map<string, Uint8Array>;
}

/** Simple async fs interface used internally to allow test overrides. */
interface FsOps {
  put(path: string, data: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  listByPrefix(prefix: string): Promise<string[]>;
}

function createMemoryFsOps(store: Map<string, Uint8Array>): FsOps {
  return {
    async put(path: string, data: Uint8Array) {
      store.set(path, new Uint8Array(data));
    },
    async get(path: string) {
      const buf = store.get(path);
      if (!buf) throw new StorageError(`File not found: ${path}`, "NOT_FOUND");
      return buf;
    },
    async delete(path: string) {
      if (!store.has(path)) throw new StorageError(`File not found: ${path}`, "NOT_FOUND");
      store.delete(path);
    },
    async exists(path: string) {
      return store.has(path);
    },
    async size(path: string) {
      const buf = store.get(path);
      if (!buf) throw new StorageError(`File not found: ${path}`, "NOT_FOUND");
      return buf.byteLength;
    },
    async listByPrefix(prefix: string) {
      const keys: string[] = [];
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) keys.push(key);
      }
      return keys;
    },
  };
}

/**
 * Real filesystem operations using Node.js APIs.
 * Lazily created to defer the `import()` to first use.
 */
function createRealFsOps(): FsOps {
  let nodeFs: typeof import("node:fs/promises") | null = null;
  let nodePath: typeof import("node:path") | null = null;

  async function ensureModules() {
    if (!nodeFs) nodeFs = await import("node:fs/promises");
    if (!nodePath) nodePath = await import("node:path");
  }

  return {
    async put(filePath: string, data: Uint8Array) {
      await ensureModules();
      const dir = nodePath!.dirname(filePath);
      await nodeFs!.mkdir(dir, { recursive: true });
      await nodeFs!.writeFile(filePath, data);
    },
    async get(filePath: string) {
      await ensureModules();
      return await nodeFs!.readFile(filePath);
    },
    async delete(filePath: string) {
      await ensureModules();
      await nodeFs!.unlink(filePath);
    },
    async exists(filePath: string) {
      await ensureModules();
      try {
        await nodeFs!.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    async size(filePath: string) {
      await ensureModules();
      const stat = await nodeFs!.stat(filePath);
      return stat.size;
    },
    async listByPrefix(dir: string) {
      await ensureModules();
      try {
        const entries = await nodeFs!.readdir(dir, { recursive: true, withFileTypes: false });
        return entries.map((e) => nodePath!.join(dir, String(e)));
      } catch {
        return [];
      }
    },
  };
}

/**
 * Local filesystem storage backend.
 *
 * Files are stored under `baseDir/<userId>/<key>`.
 * Path traversal is mitigated by rejecting keys containing `..` or absolute paths.
 */
export class LocalStorageBackend implements StorageBackend {
  readonly name = "local";
  private readonly limits: StorageLimits;
  private readonly baseDir: string;
  private readonly fsOps: FsOps;
  private readonly userLocks = new Map<string, Promise<void>>();

  constructor(options: LocalStorageOptions) {
    this.limits = { maxFileSize: options.maxSize, userQuota: options.userQuota };
    this.baseDir = options.baseDir;

    if (options._fsOverride) {
      this.fsOps = createMemoryFsOps(options._fsOverride);
    } else {
      this.fsOps = createRealFsOps();
    }
  }

  private async acquireLock(userId: string): Promise<() => void> {
    while (this.userLocks.has(userId)) {
      await this.userLocks.get(userId);
    }
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.userLocks.set(userId, lock);
    return () => {
      this.userLocks.delete(userId);
      release();
    };
  }

  getLimits(): StorageLimits {
    return { ...this.limits };
  }

  async put(userId: string, key: string, data: Uint8Array, mimeType: string): Promise<StoredFile> {
    this.validateKey(key);
    this.validateUserId(userId);

    if (data.byteLength > this.limits.maxFileSize) {
      throw new StorageError(
        `File size ${data.byteLength} exceeds maximum ${this.limits.maxFileSize}`,
        "FILE_TOO_LARGE",
      );
    }

    const release = await this.acquireLock(userId);
    try {
      if (this.limits.userQuota !== null) {
        const currentUsage = await this.calculateUsage(userId);
        if (currentUsage + data.byteLength > this.limits.userQuota) {
          throw new StorageError(
            `Upload would exceed user quota of ${this.limits.userQuota} bytes`,
            "QUOTA_EXCEEDED",
          );
        }
      }

      const fullPath = this.resolvePath(userId, key);

      try {
        await this.fsOps.put(fullPath, data);
      } catch (err) {
        if (err instanceof StorageError) throw err;
        throw new StorageError(
          `Failed to store file: ${err instanceof Error ? err.message : "unknown error"}`,
          "PUT_FAILED",
        );
      }
    } finally {
      release();
    }

    return { path: key, size: data.byteLength, mimeType };
  }

  async get(userId: string, key: string): Promise<Uint8Array> {
    this.validateKey(key);
    this.validateUserId(userId);
    const fullPath = this.resolvePath(userId, key);

    try {
      return await this.fsOps.get(fullPath);
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`File not found: ${key}`, "NOT_FOUND");
    }
  }

  async delete(userId: string, key: string): Promise<void> {
    this.validateKey(key);
    this.validateUserId(userId);
    const fullPath = this.resolvePath(userId, key);

    try {
      await this.fsOps.delete(fullPath);
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`File not found: ${key}`, "NOT_FOUND");
    }
  }

  async exists(userId: string, key: string): Promise<boolean> {
    this.validateKey(key);
    this.validateUserId(userId);
    const fullPath = this.resolvePath(userId, key);
    return this.fsOps.exists(fullPath);
  }

  private resolvePath(userId: string, key: string): string {
    return `${this.baseDir}/${userId}/${key}`;
  }

  private async calculateUsage(userId: string): Promise<number> {
    const prefix = `${this.baseDir}/${userId}/`;
    const files = await this.fsOps.listByPrefix(prefix);

    let total = 0;
    for (const f of files) {
      total += await this.fsOps.size(f);
    }
    return total;
  }

  private validateKey(key: string): void {
    if (key.startsWith("/")) {
      throw new StorageError("Key must not be absolute", "PUT_FAILED");
    }
    if (key.includes("..")) {
      throw new StorageError("Key must not contain path traversal segments", "PUT_FAILED");
    }
  }

  private validateUserId(userId: string): void {
    if (userId.startsWith("/")) {
      throw new StorageError("UserId must not be absolute", "PUT_FAILED");
    }
    if (userId.includes("..")) {
      throw new StorageError("UserId must not contain path traversal segments", "PUT_FAILED");
    }
    if (userId.includes("\0")) {
      throw new StorageError("UserId must not contain null bytes", "PUT_FAILED");
    }
  }
}
