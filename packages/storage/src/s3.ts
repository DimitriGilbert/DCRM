import type { StorageBackend, StoredFile, StorageLimits } from "./types";

import { StorageError } from "./types";

export interface S3StorageOptions {
  /** Maximum single file size in bytes. */
  maxSize: number;
  /** Per-user storage quota in bytes, or null for unlimited. */
  userQuota: number | null;
  /** S3 bucket name. */
  bucket: string;
  /** S3 region. */
  region: string;
  /** Optional S3 endpoint override for compatible services. */
  endpoint?: string;
  /** Access key ID. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
  /**
   * Internal: S3 client override for testing.
   * When provided, the real S3 client is not constructed.
   */
  _clientOverride?: S3ClientLike;
}

/**
 * Minimal interface for an S3 client.
 * Matches @aws-sdk/client-s3 S3Client's `send` method.
 */
interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

/**
 * Internal command shapes used to communicate with the mock or real client.
 */
interface InternalPut {
  readonly __cmd: "PutObject";
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
}

interface InternalGet {
  readonly __cmd: "GetObject";
  readonly key: string;
}

interface InternalDelete {
  readonly __cmd: "DeleteObject";
  readonly key: string;
}

interface InternalHead {
  readonly __cmd: "HeadObject";
  readonly key: string;
}

/**
 * S3-compatible storage backend.
 *
 * Files are stored with keys in the form `<userId>/<key>`.
 * Uses @aws-sdk/client-s3 for real operations (lazy-loaded, optional dependency).
 */
export class S3StorageBackend implements StorageBackend {
  readonly name = "s3";
  private readonly limits: StorageLimits;
  private readonly client: S3ClientLike;

  constructor(options: S3StorageOptions) {
    this.limits = { maxFileSize: options.maxSize, userQuota: options.userQuota };

    if (options._clientOverride) {
      this.client = options._clientOverride;
    } else {
      this.client = createLazyS3Client(options);
    }
  }

  getLimits(): StorageLimits {
    return { ...this.limits };
  }

  async put(userId: string, key: string, data: Uint8Array, mimeType: string): Promise<StoredFile> {
    if (data.byteLength > this.limits.maxFileSize) {
      throw new StorageError(
        `File size ${data.byteLength} exceeds maximum ${this.limits.maxFileSize}`,
        "FILE_TOO_LARGE",
      );
    }

    const s3Key = this.s3Key(userId, key);

    try {
      await this.client.send({
        __cmd: "PutObject",
        key: s3Key,
        body: data,
        contentType: mimeType,
      } satisfies InternalPut);
    } catch (err) {
      throw new StorageError(
        `S3 put failed: ${err instanceof Error ? err.message : "unknown error"}`,
        "PUT_FAILED",
      );
    }

    return { path: key, size: data.byteLength, mimeType };
  }

  async get(userId: string, key: string): Promise<Uint8Array> {
    const s3Key = this.s3Key(userId, key);

    try {
      const response = (await this.client.send({
        __cmd: "GetObject",
        key: s3Key,
      } satisfies InternalGet)) as { body: Uint8Array };

      return response.body;
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`File not found: ${key}`, "NOT_FOUND");
    }
  }

  async delete(userId: string, key: string): Promise<void> {
    const s3Key = this.s3Key(userId, key);

    try {
      await this.client.send({
        __cmd: "DeleteObject",
        key: s3Key,
      } satisfies InternalDelete);
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`File not found: ${key}`, "NOT_FOUND");
    }
  }

  async exists(userId: string, key: string): Promise<boolean> {
    const s3Key = this.s3Key(userId, key);

    try {
      await this.client.send({
        __cmd: "HeadObject",
        key: s3Key,
      } satisfies InternalHead);
      return true;
    } catch {
      return false;
    }
  }

  private s3Key(userId: string, key: string): string {
    return `${userId}/${key}`;
  }
}

/**
 * Creates a lazy S3 client that dynamically imports @aws-sdk/client-s3 on first use.
 * This keeps the dependency optional when STORAGE_TYPE=local.
 *
 * The function is declared at module scope (not as a class method) to avoid
 * `this` context issues in the returned client object.
 */
function createLazyS3Client(options: S3StorageOptions): S3ClientLike {
  let delegate: S3ClientLike | null = null;

  return {
    async send(command: unknown): Promise<unknown> {
      if (!delegate) {
        delegate = await buildRealClient(options);
      }
      return delegate.send(command);
    },
  };
}

/**
 * Dynamically imports @aws-sdk/client-s3 and builds a client wrapper
 * that translates internal command shapes to real S3 SDK commands.
 */
/**
 * Constructor types for the S3 SDK classes we use.
 */
interface S3ClientConstructor {
  new (config: {
    region: string;
    endpoint?: string;
    credentials: { accessKeyId: string; secretAccessKey: string };
  }): S3ClientLike;
}

interface S3CommandConstructor {
  new (input: Record<string, unknown>): { __command: string };
}

interface S3SdkModule {
  S3Client: S3ClientConstructor;
  PutObjectCommand: S3CommandConstructor;
  GetObjectCommand: S3CommandConstructor;
  DeleteObjectCommand: S3CommandConstructor;
  HeadObjectCommand: S3CommandConstructor;
}

async function buildRealClient(options: S3StorageOptions): Promise<S3ClientLike> {
  // @aws-sdk/client-s3 is an optional peer dependency.
  // It must be installed when STORAGE_TYPE=s3.
  // Using a variable import path to prevent TypeScript from resolving
  // the module at type-check time in dependent packages.
  const sdkModule = "@aws-sdk/client-s3";
  const mod = (await import(/* @vite-ignore */ sdkModule)) as S3SdkModule;

  const s3Client = new mod.S3Client({
    region: options.region,
    endpoint: options.endpoint,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  return {
    async send(cmd: unknown): Promise<unknown> {
      const internal = cmd as
        | InternalPut
        | InternalGet
        | InternalDelete
        | InternalHead;

      switch (internal.__cmd) {
        case "PutObject": {
          const putCmd = new mod.PutObjectCommand({
            Bucket: options.bucket,
            Key: internal.key,
            Body: internal.body,
            ContentType: internal.contentType,
          });
          return await s3Client.send(putCmd);
        }
        case "GetObject": {
          const getCmd = new mod.GetObjectCommand({
            Bucket: options.bucket,
            Key: internal.key,
          });
          const resp = (await s3Client.send(getCmd)) as { Body: { transformToByteArray(): Promise<Uint8Array> } };
          const body = await resp.Body.transformToByteArray();
          return { body };
        }
        case "DeleteObject": {
          const delCmd = new mod.DeleteObjectCommand({
            Bucket: options.bucket,
            Key: internal.key,
          });
          return await s3Client.send(delCmd);
        }
        case "HeadObject": {
          const headCmd = new mod.HeadObjectCommand({
            Bucket: options.bucket,
            Key: internal.key,
          });
          return await s3Client.send(headCmd);
        }
        default:
          throw new StorageError("Unknown S3 command", "PUT_FAILED");
      }
    },
  };
}
