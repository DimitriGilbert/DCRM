import type { Context } from "../../context.js";
import type { ClientRecord, ProjectRecord, TicketRecord } from "../../crm/types.js";
import { badRequest, notFound } from "./helpers.js";

export type ExchangeScopeInput = {
  readonly clientId?: string | null;
  readonly projectId?: string | null;
  readonly ticketId?: string | null;
};

export async function resolveExchangeScope(ctx: Context & { readonly auth: NonNullable<Context["auth"]> }, input: ExchangeScopeInput): Promise<{ readonly client: ClientRecord | null; readonly project: ProjectRecord | null; readonly ticket: TicketRecord | null }> {
  if (input.ticketId) {
    const ticket = await ctx.crmRepository.tickets.getById({ userId: ctx.auth.user.id, id: input.ticketId });
    if (!ticket || ticket.deletedAt) {
      throw notFound("Ticket not found.");
    }
    const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: ticket.projectId });
    if (!project || project.deletedAt) {
      throw notFound("Project not found.");
    }
    if (input.projectId && input.projectId !== project.id) {
      throw badRequest("Exchange project does not match ticket project.");
    }
    const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: project.clientId });
    if (!client || client.deletedAt) {
      throw notFound("Client not found.");
    }
    if (input.clientId && input.clientId !== client.id) {
      throw badRequest("Exchange client does not match project client.");
    }
    return { client, project, ticket };
  }

  if (input.projectId) {
    const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.projectId });
    if (!project || project.deletedAt) {
      throw notFound("Project not found.");
    }
    const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: project.clientId });
    if (!client || client.deletedAt) {
      throw notFound("Client not found.");
    }
    if (input.clientId && input.clientId !== client.id) {
      throw badRequest("Exchange client does not match project client.");
    }
    return { client, project, ticket: null };
  }

  if (input.clientId) {
    const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.clientId });
    if (!client || client.deletedAt) {
      throw notFound("Client not found.");
    }
    return { client, project: null, ticket: null };
  }

  throw badRequest("Exchange must be scoped to a client, project, or ticket.");
}
