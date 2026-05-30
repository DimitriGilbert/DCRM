import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { ticketIdSchema } from "./schemas.js";

export const getTicket = protectedProcedure.input(ticketIdSchema).query(async ({ ctx, input }) => {
  const ticket = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!ticket || ticket.deletedAt) {
    throw notFound("Ticket not found.");
  }
  return ticket;
});
