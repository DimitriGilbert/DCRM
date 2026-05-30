import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createServerEnv } from "./create-server-env.js";

const validHexEncryptionKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const validBase64EncryptionKey = Buffer.from(validHexEncryptionKey, "hex").toString("base64");

describe("server environment", () => {
  it("accepts a self-hosted configuration without Stripe or S3 credentials", () => {
    const parsedEnv = createServerEnv({
      APP_URL: "https://dcrm.example.com",
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "https://dcrm.example.com",
      CORS_ORIGIN: "https://dcrm.example.com",
      DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
      ENCRYPTION_KEY: validHexEncryptionKey,
      REDIS_URL: "redis://localhost:6379",
      WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
    });

    assert.equal(parsedEnv.HOSTED_BILLING_ENABLED, false);
    assert.equal(parsedEnv.STORAGE_BACKEND, "local");
    assert.equal(parsedEnv.STRIPE_SECRET_KEY, undefined);
    assert.equal(parsedEnv.S3_BUCKET, undefined);
  });

  it("accepts PostgreSQL and TLS Redis URL protocols with base64 key material", () => {
    const parsedEnv = createServerEnv({
      APP_URL: "https://dcrm.example.com",
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "https://dcrm.example.com",
      CORS_ORIGIN: "https://dcrm.example.com",
      DATABASE_URL: "postgresql://dcrm:dcrm@localhost:5432/dcrm",
      ENCRYPTION_KEY: validBase64EncryptionKey,
      REDIS_URL: "rediss://localhost:6379",
      WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
    });

    assert.equal(parsedEnv.DATABASE_URL.startsWith("postgresql://"), true);
    assert.equal(parsedEnv.REDIS_URL.startsWith("rediss://"), true);
  });

  it("rejects hosted billing mode without the required Stripe settings", () => {
    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
        ENCRYPTION_KEY: validHexEncryptionKey,
        HOSTED_BILLING_ENABLED: "true",
        REDIS_URL: "redis://localhost:6379",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );
  });

  it("rejects S3-compatible storage without object storage credentials", () => {
    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
        ENCRYPTION_KEY: validHexEncryptionKey,
        REDIS_URL: "redis://localhost:6379",
        STORAGE_BACKEND: "s3_compatible",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );
  });

  it("rejects encryption keys that do not decode to 32 bytes", () => {
    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
        ENCRYPTION_KEY: "not-a-valid-thirty-two-byte-key",
        REDIS_URL: "redis://localhost:6379",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );
  });

  it("rejects raw printable UTF-8 encryption keys even when they are 32 bytes", () => {
    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
        ENCRYPTION_KEY: "b".repeat(32),
        REDIS_URL: "redis://localhost:6379",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );
  });

  it("rejects malformed and wrong-protocol database URLs", () => {
    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "not-a-url",
        ENCRYPTION_KEY: validHexEncryptionKey,
        REDIS_URL: "redis://localhost:6379",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );

    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "mysql://dcrm:dcrm@localhost:3306/dcrm",
        ENCRYPTION_KEY: validHexEncryptionKey,
        REDIS_URL: "redis://localhost:6379",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );
  });

  it("rejects malformed and wrong-protocol Redis URLs", () => {
    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
        ENCRYPTION_KEY: validHexEncryptionKey,
        REDIS_URL: "not-a-url",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );

    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
        ENCRYPTION_KEY: validHexEncryptionKey,
        REDIS_URL: "http://localhost:6379",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );
  });
});
