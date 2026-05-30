import { LEAD_STAGES, type LeadStage } from "@DCRM/domain";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { validateCustomFieldValues } from "../../crm/custom-fields.js";

import type { CustomFieldDefinition, LeadRecord } from "../../crm/types.js";
import type { leadFieldsSchema, leadUpdateFieldsSchema } from "./schemas.js";

type CreateLeadInput = z.infer<typeof leadFieldsSchema>;
type UpdateLeadInput = z.infer<typeof leadUpdateFieldsSchema>;

type LeadValueFields = Pick<CreateLeadInput, "estimatedValueAmount" | "estimatedValueCurrency">;

export function normalizeCreateLeadFields(input: CreateLeadInput) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  return {
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    website: input.website,
    notes: input.notes,
    source: input.source,
    stage: input.stage,
    estimatedValueAmount: input.estimatedValueAmount,
    estimatedValueCurrency: normalizeEstimatedValueCurrency(input),
    socialLinks: input.socialLinks,
    address: input.address,
    metadata: input.metadata,
    customFields: parseCustomFields(definitions, input.customFields),
  };
}

export function normalizeUpdateLeadFields(input: UpdateLeadInput, existingLead: Pick<LeadRecord, "estimatedValueAmount">) {
  const definitions: readonly CustomFieldDefinition[] = input.customFieldSchema ?? [];
  const effectiveEstimatedValueAmount = input.estimatedValueAmount === undefined ? existingLead.estimatedValueAmount : input.estimatedValueAmount;
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.company !== undefined ? { company: input.company } : {}),
    ...(input.website !== undefined ? { website: input.website } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.estimatedValueAmount !== undefined ? { estimatedValueAmount: input.estimatedValueAmount } : {}),
    ...(input.estimatedValueCurrency !== undefined || input.estimatedValueAmount === null ? { estimatedValueCurrency: normalizeEstimatedValueCurrency(input.estimatedValueCurrency, effectiveEstimatedValueAmount) } : {}),
    ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.customFields !== undefined ? { customFields: parseCustomFields(definitions, input.customFields) } : {}),
  };
}

export function notFound(message: string): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message });
}

export function conflict(message: string): TRPCError {
  return new TRPCError({ code: "CONFLICT", message });
}

export function groupLeadsByStage(leads: readonly LeadRecord[]) {
  return LEAD_STAGES.map((stage) => ({ stage, leads: leads.filter((lead) => lead.stage === stage) }));
}

export function isStageChange(before: LeadStage, after: LeadStage): boolean {
  return before !== after;
}

function parseCustomFields(definitions: readonly CustomFieldDefinition[], values: Record<string, unknown> | undefined) {
  try {
    return validateCustomFieldValues(definitions, values);
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid custom fields." });
  }
}

function normalizeEstimatedValueCurrency(input: LeadValueFields): string | null | undefined;
function normalizeEstimatedValueCurrency(estimatedValueCurrency: string | null | undefined, estimatedValueAmount: string | null | undefined): string | null | undefined;
function normalizeEstimatedValueCurrency(inputOrCurrency: LeadValueFields | string | null | undefined, amount?: string | null | undefined): string | null | undefined {
  const estimatedValueAmount = typeof inputOrCurrency === "object" && inputOrCurrency !== null ? inputOrCurrency.estimatedValueAmount : amount;
  const estimatedValueCurrency = typeof inputOrCurrency === "object" && inputOrCurrency !== null ? inputOrCurrency.estimatedValueCurrency : inputOrCurrency;
  if (estimatedValueAmount == null) {
    return null;
  }
  return estimatedValueCurrency;
}
