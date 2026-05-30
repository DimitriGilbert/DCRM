import { TRPCError } from "@trpc/server";

import { TicketProjectMoveBlockedError } from "../../crm/repository.js";
import { protectedProcedure } from "../../index.js";
import { assertActiveTicketParent, isStatusChange, normalizeUpdateTicketFields, notFound } from "./helpers.js";
import { ticketUpdateFieldsSchema } from "./schemas.js";

import type { TicketRecord } from "../../crm/types.js";

export const updateTicket = protectedProcedure.input(ticketUpdateFieldsSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Ticket not found.");
  }
  await assertActiveTicketParent({ repository: ctx.crmRepository, userId: ctx.auth.user.id, projectId: before.projectId, notFoundMessage: "Ticket not found." });
  if (input.projectId !== undefined) {
    await assertActiveTicketParent({ repository: ctx.crmRepository, userId: ctx.auth.user.id, projectId: input.projectId, notFoundMessage: "Project not found." });
  }
  const now = new Date();
  const ticket = await updateTicketRecord(() => ctx.crmRepository.tickets.update({ userId: ctx.auth.user.id, id: input.id, fields: normalizeUpdateTicketFields(input, before, now), now }));
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

async function updateTicketRecord(operation: () => Promise<TicketRecord | undefined>): Promise<TicketRecord | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TicketProjectMoveBlockedError) {
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    }
    throw error;
  }
}
