import { protectedProcedure } from "../../index.js";
import { normalizeUpdateClientFields, notFound } from "./helpers.js";
import { clientUpdateFieldsSchema } from "./schemas.js";

export const updateClient = protectedProcedure.input(clientUpdateFieldsSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before) {
    throw notFound("Client not found.");
  }
  const client = await ctx.crmRepository.clients.update({ userId: ctx.auth.user.id, id: input.id, fields: normalizeUpdateClientFields(input), now: new Date() });
  if (!client) {
    throw notFound("Client not found.");
  }
  await ctx.eventService.emitApi({
    type: "client.updated",
    userId: ctx.auth.user.id,
    entity: { type: "client", id: client.id },
    payload: { id: client.id },
    changes: { before: { name: before.name, email: before.email, company: before.company, customFields: before.customFields }, after: { name: client.name, email: client.email, company: client.company, customFields: client.customFields } },
  });
  return client;
});
