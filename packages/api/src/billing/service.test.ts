import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { TRPCError } from "@trpc/server";

import { createBillingService, assertHostedBillingAccess } from "./service.js";
import { createInMemoryBillingRepository } from "./repository.js";
import type { BillingConfig, SubscriptionRecord } from "./types.js";

const disabledConfig: BillingConfig = { enabled: false, appUrl: "https://dcrm.test" };
const enabledConfig: BillingConfig = {
  enabled: true,
  appUrl: "https://dcrm.test",
  stripeSecretKey: "sk_test_secret",
  stripeWebhookSecret: "whsec_test",
  stripePriceId: "price_24_yearly",
};

test("self-hosted billing disabled returns price metadata without requiring Stripe", async () => {
  const repository = createInMemoryBillingRepository();
  const overview = await createBillingService({ config: disabledConfig, repository }).getOverview({ userId: "user_1" });

  assert.equal(overview.enabled, false);
  assert.equal(overview.hostedPrice.amountCents, 2400);
  assert.equal(overview.hostedPrice.currency, "usd");
  assert.equal(overview.hostedPrice.interval, "year");
});

test("hosted billing gate allows self-hosted access when disabled", async () => {
  const repository = createInMemoryBillingRepository();

  await assertHostedBillingAccess({ config: disabledConfig, repository, userId: "user_1", path: "clients.list" });
});

test("hosted billing gate rejects unpaid hosted access when enabled", async () => {
  const repository = createInMemoryBillingRepository();

  await assert.rejects(
    assertHostedBillingAccess({ config: enabledConfig, repository, userId: "user_1", path: "clients.list" }),
    (error: unknown) => error instanceof TRPCError && error.code === "PAYMENT_REQUIRED",
  );
});

test("hosted billing gate allows active hosted subscribers", async () => {
  const repository = createInMemoryBillingRepository([subscriptionRecord({ status: "active" })]);

  await assertHostedBillingAccess({ config: enabledConfig, repository, userId: "user_1", path: "clients.list" });
});

test("Stripe subscription webhook updates subscription status", async () => {
  const repository = createInMemoryBillingRepository([subscriptionRecord({ status: "unknown", stripeCustomerId: "cus_123" })]);
  const rawBody = JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        current_period_end: 1_767_225_600,
        items: { data: [{ price: { id: "price_24_yearly" } }] },
      },
    },
  });

  await createBillingService({ config: enabledConfig, repository }).handleWebhook({ rawBody, signature: signStripePayload(rawBody, enabledConfig.stripeWebhookSecret), now: new Date("2026-01-01T00:00:00.000Z") });

  const updated = await repository.getByUserId({ userId: "user_1" });
  assert.equal(updated?.status, "active");
  assert.equal(updated?.stripeSubscriptionId, "sub_123");
  assert.equal(updated?.stripePriceId, "price_24_yearly");
});

test("Stripe subscription webhook can create subscription from trusted metadata user", async () => {
  const repository = createInMemoryBillingRepository();
  const rawBody = JSON.stringify({
    id: "evt_2",
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_out_of_order",
        customer: "cus_out_of_order",
        status: "active",
        current_period_end: 1_767_225_600,
        metadata: { userId: "user_out_of_order" },
        items: { data: [{ price: { id: "price_24_yearly" } }] },
      },
    },
  });

  await createBillingService({ config: enabledConfig, repository }).handleWebhook({ rawBody, signature: signStripePayload(rawBody, enabledConfig.stripeWebhookSecret), now: new Date("2026-01-01T00:00:00.000Z") });

  const created = await repository.getByUserId({ userId: "user_out_of_order" });
  assert.equal(created?.status, "active");
  assert.equal(created?.stripeCustomerId, "cus_out_of_order");
  assert.equal(created?.stripeSubscriptionId, "sub_out_of_order");
  assert.equal(created?.stripePriceId, "price_24_yearly");
});

function subscriptionRecord(input: Partial<SubscriptionRecord>): SubscriptionRecord {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "billing_1",
    userId: "user_1",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    status: "unknown",
    currentPeriodEnd: null,
    cancelAt: null,
    canceledAt: null,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function signStripePayload(rawBody: string, secret: string | undefined): string {
  assert.ok(secret);
  const timestamp = "1767225600";
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
