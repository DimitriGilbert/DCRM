import { z } from "zod";

import type { WebLeadStage } from "./constants.js";

export interface ClientMutationInput {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly company?: string | null;
  readonly website?: string | null;
  readonly notes?: string | null;
  readonly socialLinks?: Record<string, unknown>;
  readonly address?: Record<string, unknown>;
}

export interface LeadMutationInput extends ClientMutationInput {
  readonly source?: string | null;
  readonly stage?: WebLeadStage;
  readonly estimatedValueAmount?: string | null;
  readonly estimatedValueCurrency?: string | null;
}

export interface ClientTextFormValues {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly company: string;
  readonly website: string;
  readonly notes: string;
  readonly socialLinksText: string;
  readonly addressText: string;
}

export interface LeadTextFormValues extends ClientTextFormValues {
  readonly source: string;
  readonly stage: WebLeadStage;
  readonly estimatedValueAmount: string;
  readonly estimatedValueCurrency: string;
}

export function clientFormValuesToInput(value: ClientTextFormValues): ClientMutationInput {
  return {
    name: value.name.trim(),
    email: emptyToNull(value.email),
    phone: emptyToNull(value.phone),
    company: emptyToNull(value.company),
    website: emptyToNull(value.website),
    notes: emptyToNull(value.notes),
    socialLinks: structuredObject(value.socialLinksText, "links"),
    address: structuredObject(value.addressText, "text"),
  };
}

export function leadFormValuesToInput(value: LeadTextFormValues): LeadMutationInput {
  const estimatedValueAmount = emptyToNull(value.estimatedValueAmount);
  return {
    ...clientFormValuesToInput(value),
    source: emptyToNull(value.source),
    stage: value.stage,
    estimatedValueAmount,
    estimatedValueCurrency: estimatedValueAmount ? (emptyToNull(value.estimatedValueCurrency)?.toUpperCase() ?? null) : null,
  };
}

export function objectText(value: Record<string, unknown> | undefined, preferredKey: "links" | "text"): string {
  if (!value) {
    return "";
  }
  const keys = Object.keys(value);
  const preferred = value[preferredKey];
  if (preferredKey === "links" && keys.length === 1 && Array.isArray(preferred) && preferred.every((item) => typeof item === "string")) {
    return preferred.filter((item): item is string => typeof item === "string").join("\n");
  }
  if (preferredKey === "text" && keys.length === 1 && typeof preferred === "string") {
    return preferred;
  }
  return keys.length > 0 ? JSON.stringify(value, null, 2) : "";
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function structuredObject(value: string, preferredKey: "links" | "text"): Record<string, unknown> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {};
  }
  const parsed = parseJsonObject(trimmed);
  if (parsed) {
    return parsed;
  }
  if (preferredKey === "links") {
    const links = value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    return links.length > 0 ? { links } : {};
  }
  return { text: trimmed };
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  const result = z.record(z.string(), z.unknown()).safeParse(parsed);
  return result.success ? result.data : undefined;
}
