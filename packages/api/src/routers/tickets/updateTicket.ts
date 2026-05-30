import { protectedProcedure } from "../../index.js";
import { isStatusChange, normalizeUpdateTicketFields, notFound } from "./helpers.js";
import { ticketUpdateFieldsSchema } from "./schemas.js";

export const updateTicket = protectedProcedure.input(ticketUpdateFieldsSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Ticket not found.");
  }
  if (input.projectId !== undefined) {
    const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.projectId });
    if (!project || project.deletedAt) {
      throw notFound("Project not found.");
    }
  }
  const ticket = await ctx.crmRepository.tickets.update({ userId: ctx.auth.user.id, id: input.id, fields: normalizeUpdateTicketFields(input), now: new Date() });
  if (!ticket) {
    throw notFound("Ticket not found.");
  }
  await ctx.eventService.emitApi({
    type: "ticket.updated",
    userId: ctx.auth.user.id,
    entity: { type: "ticket", id: ticket.id },
    payload: { id: ticket.id },
    changes: {
      before: { projectId: before.projectId, title: before.title, status: before.status, type: before.type, priority: before.priority, dueAt: before.dueAt, customFields: before.customFields },
      after: { projectId: ticket.projectId, title: ticket.title, status: ticket.status, type: ticket.type, priority: ticket.priority, dueAt: ticket.dueAt, customFields: ticket.customFields },
    },
  });
  if (isStatusChange(before.status, ticket.status)) {
    await ctx.eventService.emitApi({ type: "ticket.status_changed", userId: ctx.auth.user.id, entity: { type: "ticket", id: ticket.id }, payload: { id: ticket.id, from: before.status, to: ticket.status }, changes: { before: { status: before.status }, after: { status: ticket.status } } });
  }
  return ticket;
});
