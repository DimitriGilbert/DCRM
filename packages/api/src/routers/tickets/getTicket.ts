import { protectedProcedure } from "../../index.js";
import { assertActiveTicketParent, notFound } from "./helpers.js";
import { getTicketSchema } from "./schemas.js";

export const getTicket = protectedProcedure.input(getTicketSchema).query(async ({ ctx, input }) => {
  const ticket = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!ticket || ticket.deletedAt) {
    throw notFound("Ticket not found.");
  }
  if (!input.includeInactiveParent) {
    await assertActiveTicketParent({ repository: ctx.crmRepository, userId: ctx.auth.user.id, projectId: ticket.projectId, notFoundMessage: "Ticket not found." });
  }
  return ticket;
});
