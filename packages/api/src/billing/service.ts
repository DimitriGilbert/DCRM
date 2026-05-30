import { createHmac, timingSafeEqual } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { AuthUser } from "../context.js";
import type { BillingRepository } from "./repository.js";
import { activeSubscriptionStatuses, HOSTED_PRICE_CENTS, HOSTED_PRICE_CURRENCY, HOSTED_PRICE_INTERVAL } from "./types.js";
import type { BillingConfig, SubscriptionRecord, SubscriptionStatus } from "./types.js";

const checkoutSessionSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  customer: z.string().min(1).nullable().optional(),
});

const stripeWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

const stripeSubscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  status: z.string().min(1),
  current_period_end: z.number().int().positive().nullable().optional(),
  cancel_at: z.number().int().positive().nullable().optional(),
  canceled_at: z.number().int().positive().nullable().optional(),
  items: z.object({
    data: z.array(z.object({ price: z.object({ id: z.string().min(1) }) })).default([]),
  }).optional(),
  metadata: z.object({ userId: z.string().min(1).optional() }).optional(),
});

const checkoutCompletedSchema = z.object({
  customer: z.string().min(1),
  subscription: z.string().min(1).nullable().optional(),
  metadata: z.object({ userId: z.string().min(1).optional() }).optional(),
});

type StripeWebhookEvent = z.infer<typeof stripeWebhookSchema>;
type StripeCheckoutCompletedEventObject = z.infer<typeof checkoutCompletedSchema>;
type StripeSubscriptionEventObject = z.infer<typeof stripeSubscriptionSchema>;

export class StripeWebhookClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookClientError";
  }
}

export type BillingOverview = {
  readonly enabled: boolean;
  readonly hostedPrice: {
    readonly amountCents: number;
    readonly currency: string;
    readonly interval: string;
  };
  readonly hasActiveSubscription: boolean;
  readonly subscription: SubscriptionRecord | null;
};

export type StripeCheckoutClient = {
  readonly createCheckoutSession: (input: {
    readonly config: BillingConfig;
    readonly user: AuthUser;
    readonly existingCustomerId: string | null;
  }) => Promise<{ readonly id: string; readonly url: string; readonly customerId: string | null }>;
};

export function createBillingService(options: { readonly config: BillingConfig; readonly repository: BillingRepository; readonly stripeClient?: StripeCheckoutClient }) {
  const stripeClient = options.stripeClient ?? createFetchStripeCheckoutClient();

  return {
    async getOverview(input: { readonly userId: string }): Promise<BillingOverview> {
      const subscription = await options.repository.getByUserId({ userId: input.userId });
      return toBillingOverview(options.config, subscription ?? null);
    },
    async createCheckoutSession(input: { readonly user: AuthUser }): Promise<{ readonly url: string }> {
      if (!options.config.enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Hosted billing is not enabled." });
      }
      requireStripeConfig(options.config);
      const subscription = await options.repository.getByUserId({ userId: input.user.id });
      if (hasActiveSubscription(options.config, subscription ?? null)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subscription is already active." });
      }
      const session = await stripeClient.createCheckoutSession({ config: options.config, user: input.user, existingCustomerId: subscription?.stripeCustomerId ?? null });
      if (session.customerId) {
        await options.repository.upsertForUser({ id: subscription?.id ?? crypto.randomUUID(), userId: input.user.id, stripeCustomerId: session.customerId, now: new Date() });
      }
      return { url: session.url };
    },
    async handleWebhook(input: { readonly rawBody: string; readonly signature: string | null; readonly now: Date }): Promise<{ readonly received: true }> {
      if (!options.config.enabled) {
        return { received: true };
      }
      const webhookSecret = requireStripeConfig(options.config).stripeWebhookSecret;
      if (!input.signature || !verifyStripeSignature({ rawBody: input.rawBody, signatureHeader: input.signature, webhookSecret, now: input.now })) {
        throw new StripeWebhookClientError("Invalid Stripe webhook signature.");
      }
      const parsedEvent = parseStripeWebhookEvent(input.rawBody);
      if (parsedEvent.type === "checkout.session.completed") {
        const session = parseStripeCheckoutCompletedEventObject(parsedEvent.data.object);
        const userId = session.metadata?.userId;
        if (userId) {
          await options.repository.upsertForUser({ id: crypto.randomUUID(), userId, stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription ?? undefined, now: input.now });
        }
      }
      if (parsedEvent.type.startsWith("customer.subscription.")) {
        const subscription = parseStripeSubscriptionEventObject(parsedEvent.data.object);
        const existing = await options.repository.getByStripeCustomerId({ stripeCustomerId: subscription.customer });
        const userId = existing?.userId ?? subscription.metadata?.userId;
        if (userId) {
          await options.repository.upsertForUser({
            id: existing?.id ?? crypto.randomUUID(),
            userId,
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items?.data[0]?.price.id ?? existing?.stripePriceId,
            status: normalizeSubscriptionStatus(subscription.status),
            currentPeriodEnd: unixSecondsToDate(subscription.current_period_end),
            cancelAt: unixSecondsToDate(subscription.cancel_at),
            canceledAt: unixSecondsToDate(subscription.canceled_at),
            now: input.now,
          });
        }
      }
      return { received: true };
    },
  };
}

export async function assertHostedBillingAccess(input: { readonly config: BillingConfig; readonly repository: BillingRepository; readonly userId: string; readonly path: string }): Promise<void> {
  if (!input.config.enabled || input.path === "billing.getOverview" || input.path === "billing.createCheckoutSession") {
    return;
  }
  const subscription = await input.repository.getByUserId({ userId: input.userId });
  if (!hasActiveSubscription(input.config, subscription ?? null)) {
    throw new TRPCError({ code: "PAYMENT_REQUIRED", message: "An active hosted subscription is required." });
  }
}

export function toBillingOverview(config: BillingConfig, subscription: SubscriptionRecord | null): BillingOverview {
  return {
    enabled: config.enabled,
    hostedPrice: { amountCents: HOSTED_PRICE_CENTS, currency: HOSTED_PRICE_CURRENCY, interval: HOSTED_PRICE_INTERVAL },
    hasActiveSubscription: hasActiveSubscription(config, subscription),
    subscription,
  };
}

function hasActiveSubscription(config: BillingConfig, subscription: SubscriptionRecord | null): boolean {
  return Boolean(subscription && subscription.stripePriceId === config.stripePriceId && activeSubscriptionStatuses.some((status) => status === subscription.status));
}

function normalizeSubscriptionStatus(value: string): SubscriptionStatus {
  const statuses: readonly SubscriptionStatus[] = ["unknown", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"];
  return statuses.find((status) => status === value) ?? "unknown";
}

function unixSecondsToDate(value: number | null | undefined): Date | null {
  return value ? new Date(value * 1000) : null;
}

function requireStripeConfig(config: BillingConfig): Required<Pick<BillingConfig, "stripeSecretKey" | "stripeWebhookSecret" | "stripePriceId">> {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret || !config.stripePriceId) {
    throw new Error("Hosted billing requires Stripe configuration.");
  }
  return { stripeSecretKey: config.stripeSecretKey, stripeWebhookSecret: config.stripeWebhookSecret, stripePriceId: config.stripePriceId };
}

function parseStripeWebhookEvent(rawBody: string): StripeWebhookEvent {
  try {
    return stripeWebhookSchema.parse(JSON.parse(rawBody));
  } catch {
    throw new StripeWebhookClientError("Invalid Stripe webhook payload.");
  }
}

function parseStripeCheckoutCompletedEventObject(value: unknown): StripeCheckoutCompletedEventObject {
  try {
    return checkoutCompletedSchema.parse(value);
  } catch {
    throw new StripeWebhookClientError("Invalid Stripe checkout webhook payload.");
  }
}

function parseStripeSubscriptionEventObject(value: unknown): StripeSubscriptionEventObject {
  try {
    return stripeSubscriptionSchema.parse(value);
  } catch {
    throw new StripeWebhookClientError("Invalid Stripe subscription webhook payload.");
  }
}

function createFetchStripeCheckoutClient(): StripeCheckoutClient {
  return {
    async createCheckoutSession(input) {
      const stripeConfig = requireStripeConfig(input.config);
      const body = new URLSearchParams({
        mode: "subscription",
        success_url: `${input.config.appUrl}/settings/billing?billing=success`,
        cancel_url: `${input.config.appUrl}/settings/billing?billing=cancelled`,
        "line_items[0][price]": stripeConfig.stripePriceId,
        "line_items[0][quantity]": "1",
        "metadata[userId]": input.user.id,
        "subscription_data[metadata][userId]": input.user.id,
      });
      if (input.user.email) {
        body.set("customer_email", input.user.email);
      }
      if (input.existingCustomerId) {
        body.delete("customer_email");
        body.set("customer", input.existingCustomerId);
      }
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${stripeConfig.stripeSecretKey}`, "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) {
        throw new Error("Stripe checkout session could not be created.");
      }
      const session = checkoutSessionSchema.parse(await response.json());
      return { id: session.id, url: session.url, customerId: session.customer ?? null };
    },
  };
}

function verifyStripeSignature(input: { readonly rawBody: string; readonly signatureHeader: string; readonly webhookSecret: string; readonly now: Date }): boolean {
  const parts = input.signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) {
    return false;
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(input.now.getTime() / 1000 - timestampSeconds) > 300) {
    return false;
  }
  const expected = createHmac("sha256", input.webhookSecret).update(`${timestamp}.${input.rawBody}`).digest("hex");
  return signatures.some((signature) => safeEqualHex(signature, expected));
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
