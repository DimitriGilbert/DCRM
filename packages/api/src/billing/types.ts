export const HOSTED_PRICE_CENTS = 2400;
export const HOSTED_PRICE_CURRENCY = "usd";
export const HOSTED_PRICE_INTERVAL = "year";

export const activeSubscriptionStatuses = ["active", "trialing"] as const;

export type SubscriptionStatus =
  | "unknown"
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type BillingConfig = {
  readonly enabled: boolean;
  readonly appUrl: string;
  readonly stripeSecretKey?: string;
  readonly stripeWebhookSecret?: string;
  readonly stripePriceId?: string;
};

export type SubscriptionRecord = {
  readonly id: string;
  readonly userId: string;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly stripePriceId: string | null;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAt: Date | null;
  readonly canceledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SubscriptionUpsert = {
  readonly id: string;
  readonly userId: string;
  readonly stripeCustomerId?: string | null;
  readonly stripeSubscriptionId?: string | null;
  readonly stripePriceId?: string | null;
  readonly status?: SubscriptionStatus;
  readonly currentPeriodEnd?: Date | null;
  readonly cancelAt?: Date | null;
  readonly canceledAt?: Date | null;
  readonly now: Date;
};
