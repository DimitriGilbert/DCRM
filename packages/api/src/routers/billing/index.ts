import { protectedProcedure, router } from "../../index.js";
import { createInMemoryBillingRepository } from "../../billing/repository.js";
import { createBillingService } from "../../billing/service.js";

const disabledBillingConfig = { enabled: false, appUrl: "http://localhost" } as const;

export const billingRouter = router({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    return createBillingService({ config: ctx.billing?.config ?? disabledBillingConfig, repository: ctx.billing?.repository ?? createInMemoryBillingRepository() }).getOverview({ userId: ctx.auth.user.id });
  }),
  createCheckoutSession: protectedProcedure.mutation(async ({ ctx }) => {
    return createBillingService({ config: ctx.billing?.config ?? disabledBillingConfig, repository: ctx.billing?.repository ?? createInMemoryBillingRepository() }).createCheckoutSession({ user: ctx.auth.user });
  }),
});
