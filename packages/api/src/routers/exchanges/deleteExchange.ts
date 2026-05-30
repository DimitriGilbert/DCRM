import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { exchangeIdSchema } from "./schemas.js";

export const deleteExchange = protectedProcedure.input(exchangeIdSchema).mutation(async ({ ctx, input }) => {
  const exchange = await ctx.crmRepository.exchanges.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: new Date(), now: new Date() });
  if (!exchange) {
    throw notFound("Exchange not found.");
  }
  await ctx.eventService.emitApi({ type: "exchange.deleted", userId: ctx.auth.user.id, entity: { type: "exchange", id: exchange.id }, payload: { id: exchange.id }, changes: { before: { deletedAt: null }, after: { deletedAt: exchange.deletedAt } } });
  return exchange;
});
