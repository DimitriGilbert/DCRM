import { protectedProcedure } from "../../index.js";
import { listClientsSchema } from "./schemas.js";

export const listClients = protectedProcedure.input(listClientsSchema).query(({ ctx, input }) => {
  return ctx.crmRepository.clients.list({ userId: ctx.auth.user.id, search: input.search, includeDeleted: input.includeDeleted });
});
