import { env } from "@DCRM/env/server";

import type { SubscriptionStatusResult } from "./subscription.js";

export interface BillingMiddleware {
  /**
   * Check whether a user has active billing.
   * Returns { allowed: true } when:
   *   - BILLING_ENABLED is false, OR
   *   - the subscription status indicates an active plan.
   */
  requireActiveSubscription(
    userId: string,
    getStatus: (userId: string) => Promise<SubscriptionStatusResult>,
  ): Promise<{ allowed: true } | { allowed: false; reason: string }>;

  /** Whether billing is enabled in this environment. */
  isEnabled(): boolean;
}

export function createBillingMiddleware(): BillingMiddleware {
  return {
    async requireActiveSubscription(userId, getStatus) {
      if (!env.BILLING_ENABLED) {
        return { allowed: true } as const;
      }

      const status = await getStatus(userId);
      if (status.active) {
        return { allowed: true } as const;
      }

      return {
        allowed: false,
        reason: "Active subscription required",
      } as const;
    },

    isEnabled() {
      return env.BILLING_ENABLED;
    },
  };
}
