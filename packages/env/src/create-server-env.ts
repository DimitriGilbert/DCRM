import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const booleanFlagSchema = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const databaseUrlSchema = createUrlProtocolSchema(["postgres:", "postgresql:"], "Database URL must use postgres:// or postgresql://.");
const redisUrlSchema = createUrlProtocolSchema(["redis:", "rediss:"], "Redis URL must use redis:// or rediss://.");

const serverSchema = {
  APP_URL: z.url(),
  DATABASE_URL: databaseUrlSchema,
  REDIS_URL: redisUrlSchema,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGIN: z.url(),
  ENCRYPTION_KEY: z.string().refine(isValidEncryptionKey, "Encryption key must be 32 bytes encoded as 64 hex characters or canonical base64."),
  WEBHOOK_BASE_URL: z.url(),
  STORAGE_BACKEND: z.enum(["local", "s3_compatible"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().min(1).default("./data/attachments"),
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  USER_STORAGE_QUOTA_BYTES: z.coerce.number().int().positive().default(1024 * 1024 * 1024),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: booleanFlagSchema,
  S3_PUBLIC_BASE_URL: z.url().optional(),
  HOSTED_BILLING_ENABLED: booleanFlagSchema,
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ID: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
} as const;

/**
 * Parses and validates server-side environment variables for DCRM.
 *
 * Redis, PostgreSQL, Better Auth, app URLs, webhook base URL, and the master
 * encryption key are required operational foundations. Stripe and S3-compatible
 * storage remain optional so self-hosted deployments can run without hosted
 * billing or object storage credentials.
 */
export function createServerEnv(runtimeEnv: Record<string, string | undefined>) {
  const parsedEnv = createEnv({
    server: serverSchema,
    runtimeEnv,
    emptyStringAsUndefined: true,
  });

  if (
    parsedEnv.HOSTED_BILLING_ENABLED &&
    (!parsedEnv.STRIPE_SECRET_KEY || !parsedEnv.STRIPE_WEBHOOK_SECRET || !parsedEnv.STRIPE_PRICE_ID)
  ) {
    throw new Error("Hosted billing requires Stripe secret, webhook secret, and price ID environment variables.");
  }

  if (
    parsedEnv.STORAGE_BACKEND === "s3_compatible" &&
    (!parsedEnv.S3_ENDPOINT ||
      !parsedEnv.S3_REGION ||
      !parsedEnv.S3_BUCKET ||
      !parsedEnv.S3_ACCESS_KEY_ID ||
      !parsedEnv.S3_SECRET_ACCESS_KEY)
  ) {
    throw new Error("S3-compatible storage requires endpoint, region, bucket, access key, and secret key variables.");
  }

  return parsedEnv;
}

function isValidEncryptionKey(key: string): boolean {
  const trimmedKey = key.trim();

  if (/^[a-fA-F0-9]{64}$/u.test(trimmedKey)) {
    return true;
  }

  const base64Key = Buffer.from(trimmedKey, "base64");
  if (base64Key.byteLength === 32 && base64Key.toString("base64") === trimmedKey) {
    return true;
  }

  return false;
}

function createUrlProtocolSchema(protocols: readonly string[], message: string) {
  return z.url().refine((value) => {
    try {
      return protocols.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, message);
}
