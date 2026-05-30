import type { TicketStatus } from "@DCRM/domain";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { validateCustomFieldValues } from "../../crm/custom-fields.js";

import type { CustomFieldDefinition, TicketRecord } from "../../crm/types.js";
import type { ticketFieldsSchema, ticketUpdateFieldsSchema } from "./schemas.js";

type CreateTicketInput = z.infer<typeof ticketFieldsSchema>;
type UpdateTicketInput = z.infer<typeof ticketUpdateFieldsSchema>;

export function normalizeCreateTicketFields(input: CreateTicketInput, now: Date) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  const status = input.status ?? "open";
  return {
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    type: input.type,
    status,
    priority: input.priority,
    dueAt: input.dueAt,
    closedAt: normalizeClosedAt(status, input.closedAt, now),
    metadata: input.metadata,
    customFields: parseCustomFields(definitions, input.customFields),
  };
}

export function normalizeUpdateTicketFields(input: UpdateTicketInput, before: TicketRecord, now: Date) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  const status = input.status ?? before.status;
  const closedAt = input.closedAt === undefined ? before.closedAt : input.closedAt;
  return {
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.status !== undefined || input.closedAt !== undefined ? { status } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    ...(input.status !== undefined || input.closedAt !== undefined ? { closedAt: normalizeClosedAt(status, closedAt, now) } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.customFields !== undefined ? { customFields: parseCustomFields(definitions, input.customFields) } : {}),
  };
}

export function notFound(message: string): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message });
}

export function badRequest(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}

export function isStatusChange(before: TicketStatus, after: TicketStatus): boolean {
  return before !== after;
}

function parseCustomFields(definitions: readonly CustomFieldDefinition[], values: Record<string, unknown> | undefined) {
  try {
    return validateCustomFieldValues(definitions, values);
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid custom fields." });
  }
}

function normalizeClosedAt(status: TicketStatus, closedAt: Date | null | undefined, now: Date): Date | null {
  if (status === "open") {
    return null;
  }
  return closedAt ?? now;
}
