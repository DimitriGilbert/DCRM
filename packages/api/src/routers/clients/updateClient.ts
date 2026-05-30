import { protectedProcedure } from "../../index.js";
import { badRequest, normalizeUpdateClientFields, notFound } from "./helpers.js";
import { clientUpdateFieldsSchema } from "./schemas.js";

export const updateClient = protectedProcedure.input(clientUpdateFieldsSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Client not found.");
  }
  const fields = normalizeUpdateClientFields(input);
  if (Object.keys(fields).length === 0) {
    throw badRequest("At least one client field must be provided.");
  }
  const client = await ctx.crmRepository.clients.update({ userId: ctx.auth.user.id, id: input.id, fields, now: new Date() });
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
