import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../index.js";

import type { AutomationRepository } from "../../automation/repository.js";

const listFailedHookExecutionsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

export const listFailedHookExecutions = protectedProcedure.input(listFailedHookExecutionsSchema).query(async ({ ctx, input }) => {
  return requireAutomationRepository(ctx.automationRepository).hookExecutions.listFailures({ userId: ctx.auth.user.id, limit: input.limit });
});

function requireAutomationRepository(automationRepository: AutomationRepository | undefined): AutomationRepository {
  if (!automationRepository) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Automation repository is required for hook execution history." });
  }
  return automationRepository;
}
