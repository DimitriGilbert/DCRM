import { db } from "@DCRM/db";
import { subscriptions } from "@DCRM/db/schema/automation";
import { env } from "@DCRM/env/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../../index";

const checkoutInputSchema = z.object({
  successUrl: z.url(),
  cancelUrl: z.url(),
});

export const createCheckout = protectedProcedure
  .input(checkoutInputSchema)
  .mutation(async ({ ctx, input }) => {
    if (!env.BILLING_ENABLED) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Billing is not enabled in this environment",
      });
    }

    const { createStripeService } = await import("@DCRM/billing");
    const stripeService = createStripeService();

    return stripeService.createCheckoutSession({
      userId: ctx.user.id,
      email: ctx.user.email,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
  });

export const getSubscriptionStatus = protectedProcedure.query(
  async ({ ctx }) => {
    if (!env.BILLING_ENABLED) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Billing is not enabled in this environment",
      });
    }

    const { createSubscriptionService } = await import("@DCRM/billing");
    const subscriptionService = createSubscriptionService();

    return subscriptionService.getStatus(ctx.user.id);
  },
);

export const createPortalSession = protectedProcedure
  .input(
    z.object({
      returnUrl: z.url(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    if (!env.BILLING_ENABLED) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Billing is not enabled in this environment",
      });
    }

    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    const sub = rows[0];
    if (!sub?.stripeCustomerId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No Stripe customer found for this user",
      });
    }

    const { createStripeService } = await import("@DCRM/billing");
    const stripeService = createStripeService();

    return stripeService.createPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl: input.returnUrl,
    });
  },
);

/**
 * Stripe webhook endpoint.
 * Public (no auth) — verified via Stripe signature.
 */
export const handleWebhook = publicProcedure
  .input(
    z.object({
      body: z.string(),
      signature: z.string(),
    }),
  )
  .mutation(async ({ input }) => {
    if (!env.BILLING_ENABLED) {
      return { received: true };
    }

    const { createStripeService } = await import("@DCRM/billing");
    const { createSubscriptionService } = await import("@DCRM/billing");

    const stripeService = createStripeService();
    const subscriptionService = createSubscriptionService();

    const event = stripeService.constructWebhookEvent(
      input.body,
      input.signature,
    );

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        await subscriptionService.upsertFromStripe(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await subscriptionService.upsertFromStripe(subscription);
        break;
      }
      case "customer.deleted": {
        const customer = event.data.object;
        await subscriptionService.deactivateByCustomerId(customer.id);
        break;
      }
    }

    return { received: true };
  },
);

export const billingRouter = router({
  createCheckout,
  getSubscriptionStatus,
  createPortalSession,
  handleWebhook,
});
