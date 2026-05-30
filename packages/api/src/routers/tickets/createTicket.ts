import { protectedProcedure } from "../../index.js";
import { normalizeCreateTicketFields, notFound } from "./helpers.js";
import { ticketFieldsSchema } from "./schemas.js";

export const createTicket = protectedProcedure.input(ticketFieldsSchema).mutation(async ({ ctx, input }) => {
  const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.projectId });
  if (!project || project.deletedAt) {
    throw notFound("Project not found.");
  }
  const now = new Date();
  const ticket = await ctx.crmRepository.tickets.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields: normalizeCreateTicketFields(input, now), now });
  await ctx.eventService.emitApi({
    type: "ticket.created",
    userId: ctx.auth.user.id,
    entity: { type: "ticket", id: ticket.id },
    payload: { id: ticket.id, projectId: ticket.projectId, title: ticket.title, status: ticket.status, type: ticket.type, priority: ticket.priority },
    changes: { after: { projectId: ticket.projectId, title: ticket.title, status: ticket.status, type: ticket.type, priority: ticket.priority, dueAt: ticket.dueAt } },
  });
  return ticket;
});
