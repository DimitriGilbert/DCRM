import { eq } from "drizzle-orm";

import { db } from "@DCRM/db";
import { subscriptions } from "@DCRM/db/schema/automation";
import type { BillingStatus } from "@DCRM/domain";
import { env } from "@DCRM/env/server";
import { nanoid } from "nanoid";

import type Stripe from "stripe";

export interface SubscriptionStatusResult {
  active: boolean;
  status: BillingStatus | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionService {
  /** Get the subscription status for a user. */
  getStatus(userId: string): Promise<SubscriptionStatusResult>;

  /** Map a Stripe subscription status to a DCRM billing status. */
  mapStripeStatus(stripeStatus: string): BillingStatus;

  /** Upsert subscription from Stripe webhook data. */
  upsertFromStripe(subscription: Stripe.Subscription): Promise<void>;

  /** Deactivate subscription by Stripe customer ID (for customer.deleted). */
  deactivateByCustomerId(customerId: string): Promise<void>;
}

export function createSubscriptionService(): SubscriptionService {
  return {
    async getStatus(userId) {
      if (!env.BILLING_ENABLED) {
        return {
          active: true,
          status: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      }

      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = rows[0];
      if (!sub) {
        return {
          active: false,
          status: "inactive",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      }

      const activeStatuses: BillingStatus[] = ["active", "trialing", "past_due"];
      const isActive = activeStatuses.includes(sub.status as BillingStatus);

      return {
        active: isActive,
        status: sub.status as BillingStatus,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      };
    },

    mapStripeStatus(stripeStatus: string): BillingStatus {
      const mapping: Record<string, BillingStatus> = {
        active: "active",
        trialing: "trialing",
        past_due: "past_due",
        canceled: "canceled",
        unpaid: "canceled",
        incomplete: "inactive",
        incomplete_expired: "inactive",
        paused: "inactive",
      };
      return mapping[stripeStatus] ?? "inactive";
    },

    async upsertFromStripe(stripeSub) {
      const userId = stripeSub.metadata?.userId;
      if (!userId) {
        console.warn("Subscription event received without userId in metadata", stripeSub.id);
        return;
      }

      const status = this.mapStripeStatus(stripeSub.status);
      const customerId =
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer.id;

      // Derive period dates from Stripe subscription.
      // Stripe v18 Subscription uses start_date and trial_end/trial_start.
      // For the current period end, fall back to the first item's period.
      const periodEnd = extractPeriodEnd(stripeSub);
      const periodStart = extractPeriodStart(stripeSub);

      await db
        .insert(subscriptions)
        .values({
          id: nanoid(),
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: stripeSub.id,
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        })
        .onConflictDoUpdate({
          target: subscriptions.stripeSubscriptionId,
          set: {
            status,
            stripeCustomerId: customerId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            updatedAt: new Date(),
          },
        });
    },

    async deactivateByCustomerId(customerId) {
      await db
        .update(subscriptions)
        .set({
          status: "canceled" as BillingStatus,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, customerId));
    },
  };
}

/**
 * Extract the current period end date from a Stripe subscription.
 * Uses the first subscription item's period end, or falls back to trial_end
 * or the ended_at date.
 */
function extractPeriodEnd(sub: Stripe.Subscription): Date | null {
  // Prefer the first item's current_period_end
  const firstItem = sub.items?.data?.[0];
  if (firstItem?.current_period_end) {
    return new Date(firstItem.current_period_end * 1000);
  }
  // Fallback: if trialing, use trial_end
  if (sub.trial_end) {
    return new Date(sub.trial_end * 1000);
  }
  // Fallback: ended_at
  if (sub.ended_at) {
    return new Date(sub.ended_at * 1000);
  }
  return null;
}

/**
 * Extract the current period start date from a Stripe subscription.
 * Uses the first subscription item's period start, or falls back to
 * start_date or trial_start.
 */
function extractPeriodStart(sub: Stripe.Subscription): Date | null {
  const firstItem = sub.items?.data?.[0];
  if (firstItem?.current_period_start) {
    return new Date(firstItem.current_period_start * 1000);
  }
  if (sub.start_date) {
    return new Date(sub.start_date * 1000);
  }
  if (sub.trial_start) {
    return new Date(sub.trial_start * 1000);
  }
  return null;
}
