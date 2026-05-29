import { z } from "zod";

export const BILLING_STATUSES = {
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
  TRIALING: "trialing",
  INACTIVE: "inactive",
} as const;

export type BillingStatusKey = keyof typeof BILLING_STATUSES;

export type BillingStatus = (typeof BILLING_STATUSES)[BillingStatusKey];

export const BILLING_STATUS_VALUES: readonly BillingStatus[] =
  Object.values(BILLING_STATUSES);

export const billingStatusSchema = z.enum([
  BILLING_STATUSES.ACTIVE,
  BILLING_STATUSES.PAST_DUE,
  BILLING_STATUSES.CANCELED,
  BILLING_STATUSES.TRIALING,
  BILLING_STATUSES.INACTIVE,
]);
