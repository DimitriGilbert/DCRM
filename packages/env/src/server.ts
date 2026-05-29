import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // Background jobs (BullMQ requires Redis)
    REDIS_URL: z.url(),

    // Encryption master key for the crypto module
    ENCRYPTION_KEY: z.string().min(32),

    // Application URL for auth redirects and webhook base
    APP_URL: z.url(),

    // Storage backend: local filesystem by default, S3-compatible when configured
    STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),

    // S3-compatible storage (only when STORAGE_TYPE=s3)
    S3_ENDPOINT: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),

    // Stripe billing (env-gated: self-hosting does not require Stripe)
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PRICE_ID: z.string().min(1).optional(),
    BILLING_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((val) => val === "true"),

    // Explicit webhook base URL override. Falls back to APP_URL via webhookBaseUrl below.
    WEBHOOK_BASE_URL: z.url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

/** Resolved webhook base URL: explicit override or APP_URL fallback. */
export const webhookBaseUrl: string = env.WEBHOOK_BASE_URL ?? env.APP_URL;
