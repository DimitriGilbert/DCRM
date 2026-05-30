import { protectedProcedure } from "../../index.js";
import { normalizeTicketCommentFields, notFound } from "./helpers.js";
import { ticketCommentSchema } from "./schemas.js";

export const addTicketComment = protectedProcedure.input(ticketCommentSchema).mutation(async ({ ctx, input }) => {
  const ticket = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.ticketId });
  if (!ticket || ticket.deletedAt) {
    throw notFound("Ticket not found.");
  }
  const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: ticket.projectId });
  if (!project || project.deletedAt) {
    throw notFound("Project not found.");
  }
  const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: project.clientId });
  if (!client || client.deletedAt) {
    throw notFound("Client not found.");
  }
  const exchange = await ctx.crmRepository.exchanges.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields: normalizeTicketCommentFields(input, { client, project, ticket }), now: new Date() });
  await ctx.eventService.emitApi({
    type: "exchange.created",
    userId: ctx.auth.user.id,
    entity: { type: "exchange", id: exchange.id },
    payload: { id: exchange.id, ticketId: ticket.id, projectId: project.id, clientId: client.id, type: exchange.type, visibility: exchange.visibility },
    changes: { after: { type: exchange.type, visibility: exchange.visibility, ticketId: ticket.id, projectId: project.id, clientId: client.id } },
  });
  await ctx.eventService.emitApi({ type: "ticket.updated", userId: ctx.auth.user.id, entity: { type: "ticket", id: ticket.id }, payload: { id: ticket.id, exchangeId: exchange.id, action: "comment_added" } });
  return exchange;
});
