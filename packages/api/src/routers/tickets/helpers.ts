import type { TicketStatus } from "@DCRM/domain";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { validateCustomFieldValues } from "../../crm/custom-fields.js";

import type { CustomFieldDefinition } from "../../crm/types.js";
import type { ticketFieldsSchema, ticketUpdateFieldsSchema } from "./schemas.js";

type CreateTicketInput = z.infer<typeof ticketFieldsSchema>;
type UpdateTicketInput = z.infer<typeof ticketUpdateFieldsSchema>;

export function normalizeCreateTicketFields(input: CreateTicketInput) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  return {
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    type: input.type,
    status: input.status,
    priority: input.priority,
    dueAt: input.dueAt,
    closedAt: input.closedAt,
    metadata: input.metadata,
    customFields: parseCustomFields(definitions, input.customFields),
  };
}

export function normalizeUpdateTicketFields(input: UpdateTicketInput) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  return {
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    ...(input.closedAt !== undefined ? { closedAt: input.closedAt } : {}),
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
