import { protectedProcedure } from "../../index.js";
import { TicketCommentEmailDeliveryError, createTicketCommentEmailSender } from "../../email/send.js";
import { normalizeTicketCommentFields, notFound } from "./helpers.js";
import { ticketCommentSchema } from "./schemas.js";

import type { CrmRepository } from "../../crm/repository.js";
import type { ExchangeRecord } from "../../crm/types.js";

type JsonObject = Record<string, unknown>;

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
  if (input.emailToClient && input.visibility !== "external") {
    throw new Error("Only external ticket comments can be emailed to clients.");
  }
  const now = new Date();
  const exchange = await ctx.crmRepository.exchanges.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields: normalizeTicketCommentFields(input, { client, project, ticket }), now });
  await ctx.eventService.emitApi({
    type: "exchange.created",
    userId: ctx.auth.user.id,
    entity: { type: "exchange", id: exchange.id },
    payload: { id: exchange.id, ticketId: ticket.id, projectId: project.id, clientId: client.id, type: exchange.type, visibility: exchange.visibility },
    changes: { after: { type: exchange.type, visibility: exchange.visibility, ticketId: ticket.id, projectId: project.id, clientId: client.id } },
  });
  await ctx.eventService.emitApi({ type: "ticket.updated", userId: ctx.auth.user.id, entity: { type: "ticket", id: ticket.id }, payload: { id: ticket.id, exchangeId: exchange.id, action: "comment_added" } });
  if (!input.emailToClient) {
    return exchange;
  }
  try {
    const sentEmail = await createTicketCommentEmailSender({
      automationRepository: requireAutomationRepository(ctx.automationRepository),
      crmRepository: ctx.crmRepository,
      secretCrypto: requireSecretCrypto(ctx.secretCrypto),
      smtpClient: requireSmtpClient(ctx.smtpClient),
    })({ userId: ctx.auth.user.id, exchangeId: exchange.id, emailAccountId: input.emailAccountId, now });
    return sentEmail.exchange;
  } catch (error) {
    if (error instanceof TicketCommentEmailDeliveryError) {
      return error.exchange;
    }
    return markTicketCommentEmailFailed(ctx.crmRepository, exchange, error, now);
  }
});

async function markTicketCommentEmailFailed(crmRepository: CrmRepository, exchange: ExchangeRecord, error: unknown, now: Date): Promise<ExchangeRecord> {
  const smtp = exchange.metadata.smtp;
  const updated = await crmRepository.exchanges.update({
    userId: exchange.userId,
    id: exchange.id,
    fields: {
      metadata: { ...exchange.metadata, smtp: { ...(isJsonObject(smtp) ? smtp : {}), failedAt: now.toISOString(), status: "failed", error: getErrorMessage(error) } } satisfies JsonObject,
    },
    now,
  });
  return updated ?? exchange;
}

function requireAutomationRepository(value: Parameters<typeof createTicketCommentEmailSender>[0]["automationRepository"] | undefined) {
  if (!value) {
    throw new Error("Automation repository is required to send ticket comment email.");
  }
  return value;
}

function requireSecretCrypto(value: Parameters<typeof createTicketCommentEmailSender>[0]["secretCrypto"] | undefined) {
  if (!value) {
    throw new Error("Secret crypto is required to send ticket comment email.");
  }
  return value;
}

function requireSmtpClient(value: Parameters<typeof createTicketCommentEmailSender>[0]["smtpClient"] | undefined) {
  if (!value) {
    throw new Error("SMTP client is required to send ticket comment email.");
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Ticket comment email could not be sent.";
}
