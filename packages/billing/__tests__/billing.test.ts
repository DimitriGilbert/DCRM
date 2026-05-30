import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SubscriptionStatusResult } from "../src/subscription.js";

function mockGetStatus(
  result: SubscriptionStatusResult,
): (userId: string) => Promise<SubscriptionStatusResult> {
  return vi.fn().mockResolvedValue(result);
}

// Mock @DCRM/db so we don't need a real database
const mockQuery = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  set: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@DCRM/db", () => ({
  db: {
    select: vi.fn(() => mockQuery),
    update: vi.fn(() => mockQuery),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

describe("billing middleware - env-gated behavior", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows all requests when BILLING_ENABLED is false", async () => {
    vi.doMock("@DCRM/env/server", () => ({
      env: {
        BILLING_ENABLED: false,
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        STRIPE_PRICE_ID: undefined,
      },
    }));

    const { createBillingMiddleware } = await import("../src/middleware.js");
    const middleware = createBillingMiddleware();

    const getStatus = mockGetStatus({
      active: false,
      status: "inactive",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const result = await middleware.requireActiveSubscription(
      "user-1",
      getStatus,
    );

    expect(result.allowed).toBe(true);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("reports isEnabled as false when BILLING_ENABLED is false", async () => {
    vi.doMock("@DCRM/env/server", () => ({
      env: {
        BILLING_ENABLED: false,
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        STRIPE_PRICE_ID: undefined,
      },
    }));

    const { createBillingMiddleware } = await import("../src/middleware.js");
    const middleware = createBillingMiddleware();
    expect(middleware.isEnabled()).toBe(false);
  });

  it("allows request when billing is enabled and subscription is active", async () => {
    vi.doMock("@DCRM/env/server", () => ({
      env: {
        BILLING_ENABLED: true,
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        STRIPE_PRICE_ID: "price_test",
      },
    }));

    const { createBillingMiddleware } = await import("../src/middleware.js");
    const middleware = createBillingMiddleware();

    const getStatus = mockGetStatus({
      active: true,
      status: "active",
      currentPeriodEnd: new Date("2026-12-31"),
      cancelAtPeriodEnd: false,
    });

    const result = await middleware.requireActiveSubscription(
      "user-1",
      getStatus,
    );

    expect(result.allowed).toBe(true);
    expect(getStatus).toHaveBeenCalledWith("user-1");
  });

  it("blocks request when billing is enabled and subscription is inactive", async () => {
    vi.doMock("@DCRM/env/server", () => ({
      env: {
        BILLING_ENABLED: true,
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        STRIPE_PRICE_ID: "price_test",
      },
    }));

    const { createBillingMiddleware } = await import("../src/middleware.js");
    const middleware = createBillingMiddleware();

    const getStatus = mockGetStatus({
      active: false,
      status: "inactive",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const result = await middleware.requireActiveSubscription(
      "user-1",
      getStatus,
    );

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("Active subscription required");
    }
  });

  it("allows trialing subscriptions", async () => {
    vi.doMock("@DCRM/env/server", () => ({
      env: {
        BILLING_ENABLED: true,
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        STRIPE_PRICE_ID: "price_test",
      },
    }));

    const { createBillingMiddleware } = await import("../src/middleware.js");
    const middleware = createBillingMiddleware();

    const getStatus = mockGetStatus({
      active: true,
      status: "trialing",
      currentPeriodEnd: new Date("2026-06-30"),
      cancelAtPeriodEnd: false,
    });

    const result = await middleware.requireActiveSubscription(
      "user-1",
      getStatus,
    );

    expect(result.allowed).toBe(true);
  });
});

describe("subscription service - status mapping", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("maps Stripe statuses to DCRM billing statuses", async () => {
    vi.doMock("@DCRM/env/server", () => ({
      env: {
        BILLING_ENABLED: false,
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        STRIPE_PRICE_ID: undefined,
      },
    }));

    const { createSubscriptionService } = await import(
      "../src/subscription.js"
    );
    const service = createSubscriptionService();

    expect(service.mapStripeStatus("active")).toBe("active");
    expect(service.mapStripeStatus("trialing")).toBe("trialing");
    expect(service.mapStripeStatus("past_due")).toBe("past_due");
    expect(service.mapStripeStatus("canceled")).toBe("canceled");
    expect(service.mapStripeStatus("unpaid")).toBe("canceled");
    expect(service.mapStripeStatus("incomplete")).toBe("inactive");
    expect(service.mapStripeStatus("paused")).toBe("inactive");
    expect(service.mapStripeStatus("unknown_status")).toBe("inactive");
  });
});

describe("subscription service - getStatus when billing disabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns active:true with null status when billing is disabled", async () => {
    vi.doMock("@DCRM/env/server", () => ({
      env: {
        BILLING_ENABLED: false,
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        STRIPE_PRICE_ID: undefined,
      },
    }));

    const { createSubscriptionService } = await import(
      "../src/subscription.js"
    );
    const service = createSubscriptionService();

    const result = await service.getStatus("user-1");

    expect(result.active).toBe(true);
    expect(result.status).toBeNull();
    expect(result.currentPeriodEnd).toBeNull();
    expect(result.cancelAtPeriodEnd).toBe(false);
  });
});
