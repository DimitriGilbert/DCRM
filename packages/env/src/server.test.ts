import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createServerEnv } from "./create-server-env.js";

describe("server environment", () => {
  it("accepts a self-hosted configuration without Stripe or S3 credentials", () => {
    const parsedEnv = createServerEnv({
      APP_URL: "https://dcrm.example.com",
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "https://dcrm.example.com",
      CORS_ORIGIN: "https://dcrm.example.com",
      DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
      ENCRYPTION_KEY: "b".repeat(32),
      REDIS_URL: "redis://localhost:6379",
      WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
    });

    assert.equal(parsedEnv.HOSTED_BILLING_ENABLED, false);
    assert.equal(parsedEnv.STORAGE_BACKEND, "local");
    assert.equal(parsedEnv.STRIPE_SECRET_KEY, undefined);
    assert.equal(parsedEnv.S3_BUCKET, undefined);
  });

  it("rejects hosted billing mode without the required Stripe settings", () => {
    assert.throws(() =>
      createServerEnv({
        APP_URL: "https://dcrm.example.com",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "https://dcrm.example.com",
        CORS_ORIGIN: "https://dcrm.example.com",
        DATABASE_URL: "postgres://dcrm:dcrm@localhost:5432/dcrm",
        ENCRYPTION_KEY: "b".repeat(32),
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
        ENCRYPTION_KEY: "b".repeat(32),
        REDIS_URL: "redis://localhost:6379",
        STORAGE_BACKEND: "s3_compatible",
        WEBHOOK_BASE_URL: "https://dcrm.example.com/api/webhooks",
      }),
    );
  });
});
