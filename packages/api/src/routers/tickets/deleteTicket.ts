import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { ticketIdSchema } from "./schemas.js";

export const deleteTicket = protectedProcedure.input(ticketIdSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before) {
    throw notFound("Ticket not found.");
  }
  if (before.deletedAt) {
    return before;
  }
  const now = new Date();
  const ticket = await ctx.crmRepository.tickets.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: now, now });
  if (!ticket) {
    throw notFound("Ticket not found.");
  }
  await ctx.eventService.emitApi({ type: "ticket.deleted", userId: ctx.auth.user.id, entity: { type: "ticket", id: ticket.id }, payload: { id: ticket.id }, changes: { before: { deletedAt: before.deletedAt }, after: { deletedAt: ticket.deletedAt } } });
  return ticket;
});
