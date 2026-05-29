import { describe, expect, it } from "vitest";

describe("Billing subscription statuses", () => {
  it("exports all required billing statuses", async () => {
    const { BILLING_STATUSES } = await import("../src/billing");

    expect(BILLING_STATUSES).toEqual({
      ACTIVE: "active",
      PAST_DUE: "past_due",
      CANCELED: "canceled",
      TRIALING: "trialing",
      INACTIVE: "inactive",
    });
  });

  it("validates correct billing statuses via schema", async () => {
    const { BILLING_STATUSES, billingStatusSchema } = await import("../src/billing");

    for (const status of Object.values(BILLING_STATUSES)) {
      expect(billingStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid billing status values", async () => {
    const { billingStatusSchema } = await import("../src/billing");

    expect(billingStatusSchema.safeParse("expired").success).toBe(false);
  });
});
