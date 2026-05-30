import { protectedProcedure } from "../../index.js";
import { resolveExchangeScope } from "./resolveExchangeScope.js";
import { timelineSchema } from "./schemas.js";

export const listTimeline = protectedProcedure.input(timelineSchema).query(async ({ ctx, input }) => {
  if (!input.clientId && !input.projectId && !input.ticketId) {
    return ctx.crmRepository.exchanges.listTimeline({ userId: ctx.auth.user.id, includeDeleted: input.includeDeleted });
  }

  const scope = await resolveExchangeScope(ctx, input);
  return ctx.crmRepository.exchanges.listTimeline({
    userId: ctx.auth.user.id,
    clientId: scope.client?.id ?? undefined,
    projectId: scope.project?.id ?? undefined,
    ticketId: scope.ticket?.id ?? undefined,
    includeDeleted: input.includeDeleted,
  });
});
