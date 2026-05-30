import { protectedProcedure } from "../../index.js";
import { normalizeCreateExchangeFields } from "./helpers.js";
import { resolveExchangeScope } from "./resolveExchangeScope.js";
import { exchangeFieldsSchema } from "./schemas.js";

export const createExchange = protectedProcedure.input(exchangeFieldsSchema).mutation(async ({ ctx, input }) => {
  const scope = await resolveExchangeScope(ctx, input);
  const exchange = await ctx.crmRepository.exchanges.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields: normalizeCreateExchangeFields(input, scope), now: new Date() });
  await ctx.eventService.emitApi({
    type: exchange.type === "email" ? "exchange.exchange_received" : "exchange.created",
    userId: ctx.auth.user.id,
    entity: { type: "exchange", id: exchange.id },
    payload: { id: exchange.id, clientId: exchange.clientId, projectId: exchange.projectId, ticketId: exchange.ticketId, type: exchange.type, visibility: exchange.visibility },
    changes: { after: { type: exchange.type, visibility: exchange.visibility, clientId: exchange.clientId, projectId: exchange.projectId, ticketId: exchange.ticketId } },
  });
  return exchange;
});
