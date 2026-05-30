import { protectedProcedure } from "../../index.js";
import { normalizeUpdateExchangeFields, notFound } from "./helpers.js";
import { resolveExchangeScope } from "./resolveExchangeScope.js";
import { exchangeUpdateFieldsSchema } from "./schemas.js";

export const updateExchange = protectedProcedure.input(exchangeUpdateFieldsSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.exchanges.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Exchange not found.");
  }
  const scope = input.clientId !== undefined || input.projectId !== undefined || input.ticketId !== undefined ? await resolveExchangeScope(ctx, input) : { client: null, project: null, ticket: null };
  const exchange = await ctx.crmRepository.exchanges.update({ userId: ctx.auth.user.id, id: input.id, fields: normalizeUpdateExchangeFields(input, scope, before), now: new Date() });
  if (!exchange) {
    throw notFound("Exchange not found.");
  }
  await ctx.eventService.emitApi({
    type: "exchange.updated",
    userId: ctx.auth.user.id,
    entity: { type: "exchange", id: exchange.id },
    payload: { id: exchange.id },
    changes: { before: { type: before.type, visibility: before.visibility, body: before.body }, after: { type: exchange.type, visibility: exchange.visibility, body: exchange.body } },
  });
  return exchange;
});
