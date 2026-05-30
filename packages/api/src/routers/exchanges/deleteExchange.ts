import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { exchangeIdSchema } from "./schemas.js";

export const deleteExchange = protectedProcedure.input(exchangeIdSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.exchanges.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before) {
    throw notFound("Exchange not found.");
  }
  if (before.deletedAt) {
    return before;
  }
  const now = new Date();
  const exchange = await ctx.crmRepository.exchanges.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: now, now });
  if (!exchange) {
    throw notFound("Exchange not found.");
  }
  await ctx.eventService.emitApi({ type: "exchange.deleted", userId: ctx.auth.user.id, entity: { type: "exchange", id: exchange.id }, payload: { id: exchange.id }, changes: { before: { deletedAt: before.deletedAt }, after: { deletedAt: exchange.deletedAt } } });
  return exchange;
});
