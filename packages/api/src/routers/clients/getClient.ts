import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { clientIdSchema } from "./schemas.js";

export const getClient = protectedProcedure.input(clientIdSchema).query(async ({ ctx, input }) => {
  const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!client) {
    throw notFound("Client not found.");
  }
  return client;
});
