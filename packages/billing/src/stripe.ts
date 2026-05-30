import { env } from "@DCRM/env/server";

import Stripe from "stripe";

/** Lazily-initialised Stripe client singleton. */
let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!_stripe) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error(
        "STRIPE_SECRET_KEY is required when billing is enabled",
      );
    }
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    });
  }
  return _stripe;
}

export interface CheckoutSessionResult {
  url: string | null;
  sessionId: string;
}

export interface StripeService {
  /** Create a Stripe checkout session for the annual $24 plan. */
  createCheckoutSession(params: {
    userId: string;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSessionResult>;

  /** Create a Stripe billing portal session for subscription management. */
  createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;

  /** Construct and verify a Stripe webhook event. */
  constructWebhookEvent(
    body: string | Buffer,
    signature: string,
  ): Stripe.Event;

  /** Retrieve a Stripe subscription. */
  getSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Response<Stripe.Subscription> | null>;
}

export function createStripeService(): StripeService {
  return {
    async createCheckoutSession({ userId, email, successUrl, cancelUrl }) {
      const stripe = getStripeClient();

      const customers = await stripe.customers.list({
        email,
        limit: 1,
      });

      let customerId: string;
      if (customers.data.length > 0) {
        customerId = customers.data[0]!.id;
      } else {
        const customer = await stripe.customers.create(
          {
            email,
            metadata: { userId },
          },
          {
            idempotencyKey: `customer-create-${userId}`,
          },
        );
        customerId = customer.id;
      }

      const priceId = env.STRIPE_PRICE_ID;
      if (!priceId) {
        throw new Error("STRIPE_PRICE_ID is required when billing is enabled");
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { userId },
        subscription_data: {
          metadata: { userId },
        },
      });

      return {
        url: session.url,
        sessionId: session.id,
      };
    },

    async createPortalSession({ customerId, returnUrl }) {
      const stripe = getStripeClient();
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    },

    constructWebhookEvent(body, signature) {
      const stripe = getStripeClient();
      const secret = env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        throw new Error(
          "STRIPE_WEBHOOK_SECRET is required when billing is enabled",
        );
      }
      return stripe.webhooks.constructEvent(body, signature, secret);
    },

    async getSubscription(subscriptionId) {
      const stripe = getStripeClient();
      try {
        return await stripe.subscriptions.retrieve(subscriptionId);
      } catch (err) {
        if (err instanceof Stripe.errors.StripeInvalidRequestError) {
          return null;
        }
        console.error("Failed to retrieve Stripe subscription", err);
        throw err;
      }
    },
  };
}
