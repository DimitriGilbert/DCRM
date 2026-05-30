import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { validateCustomFieldValues } from "../../crm/custom-fields.js";

import type { CustomFieldDefinition } from "../../crm/types.js";
import type { clientFieldsSchema, clientUpdateFieldsSchema } from "./schemas.js";

type CreateClientInput = z.infer<typeof clientFieldsSchema>;
type UpdateClientInput = z.infer<typeof clientUpdateFieldsSchema>;

export function normalizeCreateClientFields(input: CreateClientInput) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  return {
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    website: input.website,
    notes: input.notes,
    socialLinks: input.socialLinks,
    address: input.address,
    metadata: input.metadata,
    customFields: parseCustomFields(definitions, input.customFields),
  };
}

export function normalizeUpdateClientFields(input: UpdateClientInput) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.company !== undefined ? { company: input.company } : {}),
    ...(input.website !== undefined ? { website: input.website } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
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

function parseCustomFields(definitions: readonly CustomFieldDefinition[], values: Record<string, unknown> | undefined) {
  try {
    return validateCustomFieldValues(definitions, values);
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid custom fields." });
  }
}
