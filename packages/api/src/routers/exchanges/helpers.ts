import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import type { ClientRecord, ExchangeMutationFields, ExchangeRecord, ProjectRecord, TicketRecord } from "../../crm/types.js";
import type { exchangeFieldsSchema, exchangeUpdateFieldsSchema, ticketCommentSchema } from "./schemas.js";

type CreateExchangeInput = z.infer<typeof exchangeFieldsSchema>;
type UpdateExchangeInput = z.infer<typeof exchangeUpdateFieldsSchema>;
type TicketCommentInput = z.infer<typeof ticketCommentSchema>;

export type ExchangeParentScope = {
  readonly client: ClientRecord | null;
  readonly project: ProjectRecord | null;
  readonly ticket: TicketRecord | null;
};

type TicketCommentScope = {
  readonly client: ClientRecord;
  readonly project: ProjectRecord;
  readonly ticket: TicketRecord;
};

export function normalizeCreateExchangeFields(input: CreateExchangeInput, scope: ExchangeParentScope): ExchangeMutationFields {
  assertInternalNoteSafety(input.type, input.visibility);
  return {
    clientId: scope.client?.id ?? null,
    projectId: scope.project?.id ?? null,
    ticketId: scope.ticket?.id ?? null,
    type: input.type,
    visibility: input.visibility ?? "internal",
    subject: input.subject,
    body: input.body,
    occurredAt: input.occurredAt,
    externalMessageId: input.externalMessageId,
    threadId: input.threadId,
    metadata: input.metadata,
  };
}

export function normalizeUpdateExchangeFields(input: UpdateExchangeInput, scope: ExchangeParentScope, current: ExchangeRecord): Partial<ExchangeMutationFields> {
  const nextType = input.type ?? current.type;
  const nextVisibility = input.visibility ?? current.visibility;
  assertInternalNoteSafety(nextType, nextVisibility, input.visibility === undefined);

  return {
    ...(input.clientId !== undefined || input.projectId !== undefined || input.ticketId !== undefined ? { clientId: scope.client?.id ?? null, projectId: scope.project?.id ?? null, ticketId: scope.ticket?.id ?? null } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : nextType === "note" && current.visibility === "external" ? { visibility: "internal" } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
    ...(input.externalMessageId !== undefined ? { externalMessageId: input.externalMessageId } : {}),
    ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

export function normalizeTicketCommentFields(input: TicketCommentInput, scope: TicketCommentScope): ExchangeMutationFields {
  return {
    clientId: scope.client.id,
    projectId: scope.project.id,
    ticketId: scope.ticket.id,
    type: "comment",
    visibility: input.visibility ?? "internal",
    body: input.body,
    occurredAt: input.occurredAt,
    metadata: input.metadata,
  };
}

export function notFound(message: string): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message });
}

export function badRequest(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}

function assertInternalNoteSafety(type: string, visibility: string | undefined, canNormalizeExternalNote = false): void {
  if (type === "note" && visibility === "external") {
    if (canNormalizeExternalNote) {
      return;
    }
    throw badRequest("Internal notes cannot be externally sendable.");
  }
}
