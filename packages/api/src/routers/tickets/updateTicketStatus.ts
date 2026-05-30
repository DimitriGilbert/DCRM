import { protectedProcedure } from "../../index.js";
import { assertActiveTicketParent, notFound } from "./helpers.js";
import { updateTicketStatusSchema } from "./schemas.js";

export const updateTicketStatus = protectedProcedure.input(updateTicketStatusSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Ticket not found.");
  }
  await assertActiveTicketParent({ repository: ctx.crmRepository, userId: ctx.auth.user.id, projectId: before.projectId, notFoundMessage: "Ticket not found." });
  if (before.status === input.status) {
    return before;
  }
  const ticket = await ctx.crmRepository.tickets.update({ userId: ctx.auth.user.id, id: input.id, fields: { status: input.status, closedAt: input.status === "closed" ? new Date() : null }, now: new Date() });
  if (!ticket) {
    throw notFound("Ticket not found.");
  }
  await ctx.eventService.emitApi({ type: "ticket.status_changed", userId: ctx.auth.user.id, entity: { type: "ticket", id: ticket.id }, payload: { id: ticket.id, from: before.status, to: ticket.status }, changes: { before: { status: before.status, closedAt: before.closedAt }, after: { status: ticket.status, closedAt: ticket.closedAt } } });
  return ticket;
});
