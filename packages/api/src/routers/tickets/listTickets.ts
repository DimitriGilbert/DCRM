import { protectedProcedure } from "../../index.js";
import { listTicketsSchema } from "./schemas.js";

export const listTickets = protectedProcedure.input(listTicketsSchema).query(async ({ ctx, input }) => {
  return ctx.crmRepository.tickets.list({ userId: ctx.auth.user.id, ...input });
});
