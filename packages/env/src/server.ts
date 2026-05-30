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

    REDIS_URL: z.url(),

    ENCRYPTION_KEY: z.string().min(32),

    APP_URL: z.url(),

    STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),

    S3_ENDPOINT: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),

    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PRICE_ID: z.string().min(1).optional(),
    BILLING_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((val) => val === "true"),

    LOCAL_UPLOAD_DIR: z.string().min(1).optional(),

    WEBHOOK_BASE_URL: z.url().optional(),
  },

  createFinalSchema: (shape) =>
    z.object(shape).refine(
      (data) => {
        if (data.STORAGE_TYPE === "s3") {
          return !!(data.S3_BUCKET && data.S3_ACCESS_KEY_ID && data.S3_SECRET_ACCESS_KEY);
        }
        return true;
      },
      {
        message: "S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required when STORAGE_TYPE is 's3'",
        path: ["STORAGE_TYPE"],
      },
    ),

  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

/** Resolved webhook base URL: explicit override or APP_URL fallback. */
export const webhookBaseUrl: string = env.WEBHOOK_BASE_URL ?? env.APP_URL;
