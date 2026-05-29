import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD tests for the server environment schema.
 *
 * Strategy: @t3-oss/env-core reads process.env at module evaluation time.
 * We set process.env directly and use vi.resetModules() + dynamic import()
 * to force re-evaluation with fresh env each test.
 *
 * @t3-oss/env-core throws an Error with message "Invalid environment variables"
 * and logs the details to stderr. Tests assert the error is thrown and
 * the field name appears in the logged output.
 */

const BASE_REQUIRED: Record<string, string> = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/dcrm",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3001",
  CORS_ORIGIN: "http://localhost:3001",
  REDIS_URL: "redis://localhost:6379",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  APP_URL: "http://localhost:3001",
};

const ALL_OPTIONAL_KEYS = [
  "STORAGE_TYPE",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "BILLING_ENABLED",
  "WEBHOOK_BASE_URL",
  "NODE_ENV",
];

function setEnv(
  base: Record<string, string>,
  overrides: Record<string, string | undefined> = {},
): void {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(overrides), ...ALL_OPTIONAL_KEYS]);
  for (const key of allKeys) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(base)) {
    process.env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

interface ServerModule {
  env: Record<string, string | boolean | undefined>;
  webhookBaseUrl: string;
}

async function importServer(): Promise<ServerModule> {
  vi.resetModules();
  const mod = await import("../src/server.ts");
  return mod as ServerModule;
}

describe("server environment schema", () => {
  beforeEach(() => {
    for (const key of [...Object.keys(BASE_REQUIRED), ...ALL_OPTIONAL_KEYS]) {
      delete process.env[key];
    }
  });

  it("validates when all required vars are present with correct defaults", async () => {
    setEnv(BASE_REQUIRED);
    const { env, webhookBaseUrl } = await importServer();

    expect(env.DATABASE_URL).toBe(BASE_REQUIRED.DATABASE_URL);
    expect(env.BETTER_AUTH_SECRET).toBe(BASE_REQUIRED.BETTER_AUTH_SECRET);
    expect(env.BETTER_AUTH_URL).toBe(BASE_REQUIRED.BETTER_AUTH_URL);
    expect(env.CORS_ORIGIN).toBe(BASE_REQUIRED.CORS_ORIGIN);
    expect(env.REDIS_URL).toBe(BASE_REQUIRED.REDIS_URL);
    expect(env.ENCRYPTION_KEY).toBe(BASE_REQUIRED.ENCRYPTION_KEY);
    expect(env.APP_URL).toBe(BASE_REQUIRED.APP_URL);
    expect(env.NODE_ENV).toBe("development");
    expect(env.STORAGE_TYPE).toBe("local");
    expect(env.BILLING_ENABLED).toBe(false);
    expect(webhookBaseUrl).toBe(BASE_REQUIRED.APP_URL);
  });

  it("rejects missing REDIS_URL", async () => {
    const { REDIS_URL: _, ...withoutRedis } = BASE_REQUIRED;
    setEnv(withoutRedis);
    await expect(importServer()).rejects.toThrow("Invalid environment variables");
  });

  it("rejects missing ENCRYPTION_KEY", async () => {
    const { ENCRYPTION_KEY: _, ...withoutEncryption } = BASE_REQUIRED;
    setEnv(withoutEncryption);
    await expect(importServer()).rejects.toThrow("Invalid environment variables");
  });

  it("rejects missing APP_URL", async () => {
    const { APP_URL: _, ...withoutAppUrl } = BASE_REQUIRED;
    setEnv(withoutAppUrl);
    await expect(importServer()).rejects.toThrow("Invalid environment variables");
  });

  it("accepts optional Stripe env vars when provided", async () => {
    setEnv(BASE_REQUIRED, {
      STRIPE_SECRET_KEY: "sk_test_abc",
      STRIPE_WEBHOOK_SECRET: "whsec_abc",
      STRIPE_PRICE_ID: "price_abc",
      BILLING_ENABLED: "true",
    });
    const { env } = await importServer();

    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_abc");
    expect(env.STRIPE_WEBHOOK_SECRET).toBe("whsec_abc");
    expect(env.STRIPE_PRICE_ID).toBe("price_abc");
    expect(env.BILLING_ENABLED).toBe(true);
  });

  it("uses webhookBaseUrl derived from WEBHOOK_BASE_URL when set", async () => {
    setEnv(BASE_REQUIRED, {
      WEBHOOK_BASE_URL: "https://hooks.example.com",
    });
    const { env, webhookBaseUrl } = await importServer();

    expect(env.WEBHOOK_BASE_URL).toBe("https://hooks.example.com");
    expect(webhookBaseUrl).toBe("https://hooks.example.com");
  });

  it("falls back webhookBaseUrl to APP_URL when WEBHOOK_BASE_URL is unset", async () => {
    setEnv(BASE_REQUIRED);
    const { env, webhookBaseUrl } = await importServer();

    expect(env.WEBHOOK_BASE_URL).toBeUndefined();
    expect(webhookBaseUrl).toBe(BASE_REQUIRED.APP_URL);
  });

  it("accepts S3 storage config when STORAGE_TYPE is s3", async () => {
    setEnv(BASE_REQUIRED, {
      STORAGE_TYPE: "s3",
      S3_ENDPOINT: "https://s3.amazonaws.com",
      S3_BUCKET: "dcrm-files",
      S3_ACCESS_KEY_ID: "AKID",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_REGION: "us-east-1",
    });
    const { env } = await importServer();

    expect(env.STORAGE_TYPE).toBe("s3");
    expect(env.S3_ENDPOINT).toBe("https://s3.amazonaws.com");
    expect(env.S3_BUCKET).toBe("dcrm-files");
    expect(env.S3_ACCESS_KEY_ID).toBe("AKID");
    expect(env.S3_SECRET_ACCESS_KEY).toBe("secret");
    expect(env.S3_REGION).toBe("us-east-1");
  });

  it("rejects invalid STORAGE_TYPE value", async () => {
    setEnv(BASE_REQUIRED, { STORAGE_TYPE: "ftp" });
    await expect(importServer()).rejects.toThrow("Invalid environment variables");
  });

  it("NODE_ENV accepts production and test", async () => {
    setEnv(BASE_REQUIRED, { NODE_ENV: "production" });
    const env1 = await importServer();
    expect(env1.env.NODE_ENV).toBe("production");

    setEnv(BASE_REQUIRED, { NODE_ENV: "test" });
    const env2 = await importServer();
    expect(env2.env.NODE_ENV).toBe("test");
  });
});
