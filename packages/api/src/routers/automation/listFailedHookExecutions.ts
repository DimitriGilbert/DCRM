import { z } from "zod";

import { protectedProcedure } from "../../index.js";

const listFailedHookExecutionsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

export const listFailedHookExecutions = protectedProcedure.input(listFailedHookExecutionsSchema).query(async ({ ctx, input }) => {
  return ctx.automationRepository?.hookExecutions.listFailures({ userId: ctx.auth.user.id, limit: input.limit }) ?? [];
});
