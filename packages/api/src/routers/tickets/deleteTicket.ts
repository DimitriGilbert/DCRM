import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { ticketIdSchema } from "./schemas.js";

export const deleteTicket = protectedProcedure.input(ticketIdSchema).mutation(async ({ ctx, input }) => {
  const ticket = await ctx.crmRepository.tickets.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: new Date(), now: new Date() });
  if (!ticket) {
    throw notFound("Ticket not found.");
  }
  await ctx.eventService.emitApi({ type: "ticket.deleted", userId: ctx.auth.user.id, entity: { type: "ticket", id: ticket.id }, payload: { id: ticket.id }, changes: { before: { deletedAt: null }, after: { deletedAt: ticket.deletedAt } } });
  return ticket;
});
