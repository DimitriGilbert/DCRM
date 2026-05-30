import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { exchangeIdSchema } from "./schemas.js";

export const getExchange = protectedProcedure.input(exchangeIdSchema).query(async ({ ctx, input }) => {
  const exchange = await ctx.crmRepository.exchanges.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!exchange || exchange.deletedAt) {
    throw notFound("Exchange not found.");
  }
  return exchange;
});
