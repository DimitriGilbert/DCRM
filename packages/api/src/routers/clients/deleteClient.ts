import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { clientIdSchema } from "./schemas.js";

export const deleteClient = protectedProcedure.input(clientIdSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before) {
    throw notFound("Client not found.");
  }
  if (before.deletedAt) {
    return before;
  }
  const now = new Date();
  const client = await ctx.crmRepository.clients.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: now, now });
  if (!client) {
    throw notFound("Client not found.");
  }
  await ctx.eventService.emitApi({ type: "client.deleted", userId: ctx.auth.user.id, entity: { type: "client", id: client.id }, payload: { id: client.id } });
  return client;
});
