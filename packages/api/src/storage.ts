import { env } from "@DCRM/env/server";
import { createStorage } from "@DCRM/storage";

import type { StorageBackend } from "@DCRM/storage";

let cachedBackend: StorageBackend | null = null;

export function getStorageBackend(): StorageBackend {
  if (!cachedBackend) {
    cachedBackend = createStorage({
      STORAGE_TYPE: env.STORAGE_TYPE,
      LOCAL_BASE_DIR: env.LOCAL_UPLOAD_DIR,
      S3_BUCKET: env.S3_BUCKET,
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_REGION: env.S3_REGION,
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    });
  }
  return cachedBackend;
}
