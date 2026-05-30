import type { ProjectStatus } from "@DCRM/domain";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { validateCustomFieldValues } from "../../crm/custom-fields.js";

import type { CustomFieldDefinition } from "../../crm/types.js";
import type { projectFieldsSchema, projectUpdateFieldsSchema } from "./schemas.js";

type CreateProjectInput = z.infer<typeof projectFieldsSchema>;
type UpdateProjectInput = z.infer<typeof projectUpdateFieldsSchema>;

export function normalizeCreateProjectFields(input: CreateProjectInput) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  return {
    clientId: input.clientId,
    name: input.name,
    description: input.description,
    status: input.status,
    budgetAmount: input.budgetAmount,
    budgetCurrency: input.budgetCurrency,
    estimatedHours: input.estimatedHours,
    actualHours: input.actualHours,
    startsAt: input.startsAt,
    dueAt: input.dueAt,
    completedAt: input.completedAt,
    metadata: input.metadata,
    customFields: parseCustomFields(definitions, input.customFields),
  };
}

export function normalizeUpdateProjectFields(input: UpdateProjectInput) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  return {
    ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.budgetAmount !== undefined ? { budgetAmount: input.budgetAmount } : {}),
    ...(input.budgetCurrency !== undefined ? { budgetCurrency: input.budgetCurrency } : {}),
    ...(input.estimatedHours !== undefined ? { estimatedHours: input.estimatedHours } : {}),
    ...(input.actualHours !== undefined ? { actualHours: input.actualHours } : {}),
    ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.customFields !== undefined ? { customFields: parseCustomFields(definitions, input.customFields) } : {}),
  };
}

export function notFound(message: string): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message });
}

export function isStatusChange(before: ProjectStatus, after: ProjectStatus): boolean {
  return before !== after;
}

function parseCustomFields(definitions: readonly CustomFieldDefinition[], values: Record<string, unknown> | undefined) {
  try {
    return validateCustomFieldValues(definitions, values);
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid custom fields." });
  }
}
