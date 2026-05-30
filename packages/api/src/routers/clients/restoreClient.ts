import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { clientIdSchema } from "./schemas.js";

export const restoreClient = protectedProcedure.input(clientIdSchema).mutation(async ({ ctx, input }) => {
  const client = await ctx.crmRepository.clients.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: null, now: new Date() });
  if (!client) {
    throw notFound("Client not found.");
  }
  await ctx.eventService.emitApi({ type: "client.restored", userId: ctx.auth.user.id, entity: { type: "client", id: client.id }, payload: { id: client.id } });
  return client;
});
