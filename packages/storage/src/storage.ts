import type { StorageBackend } from "./types";

import { LocalStorageBackend } from "./local";
import { S3StorageBackend } from "./s3";

export interface StorageConfig {
  STORAGE_TYPE: "local" | "s3";
  /** Local base directory (required when type is local). */
  LOCAL_BASE_DIR?: string;
  /** Maximum file size in bytes. Defaults to 25 MB. */
  MAX_FILE_SIZE?: number;
  /** Per-user quota in bytes or null. Defaults to 500 MB for local. */
  USER_QUOTA?: number | null;
  /** S3 bucket (required when type is s3). */
  S3_BUCKET?: string;
  /** S3 endpoint override. */
  S3_ENDPOINT?: string;
  /** S3 region. */
  S3_REGION?: string;
  /** S3 access key ID. */
  S3_ACCESS_KEY_ID?: string;
  /** S3 secret access key. */
  S3_SECRET_ACCESS_KEY?: string;
}

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const DEFAULT_LOCAL_QUOTA = 500 * 1024 * 1024; // 500 MB

/**
 * Factory that creates the appropriate StorageBackend based on config.
 */
export function createStorage(config: StorageConfig): StorageBackend {
  const maxSize = config.MAX_FILE_SIZE ?? DEFAULT_MAX_FILE_SIZE;

  if (config.STORAGE_TYPE === "s3") {
    if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY");
    }

    return new S3StorageBackend({
      maxSize,
      userQuota: config.USER_QUOTA ?? null,
      bucket: config.S3_BUCKET,
      region: config.S3_REGION ?? "us-east-1",
      endpoint: config.S3_ENDPOINT,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  }

  return new LocalStorageBackend({
    maxSize,
    userQuota: config.USER_QUOTA ?? DEFAULT_LOCAL_QUOTA,
    baseDir: config.LOCAL_BASE_DIR ?? "./uploads",
  });
}
