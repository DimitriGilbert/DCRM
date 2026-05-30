import { initTRPC, TRPCError } from "@trpc/server";

import { assertHostedBillingAccess } from "./billing/service.js";
import type { Context } from "./context";
import { createInMemoryBillingRepository } from "./billing/repository.js";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next, path }) => {
  if (!ctx.auth) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session or API key",
    });
  }
  await assertHostedBillingAccess({ config: ctx.billing?.config ?? { enabled: false, appUrl: "http://localhost" }, repository: ctx.billing?.repository ?? createInMemoryBillingRepository(), userId: ctx.auth.user.id, path });
  return next({
    ctx: {
      ...ctx,
      auth: ctx.auth,
    },
  });
});
