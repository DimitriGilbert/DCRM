import { CUSTOM_FIELD_TYPES } from "@DCRM/domain";
import { z } from "zod";

import type { CustomFieldDefinition, JsonObject } from "./types.js";

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), z.unknown());

export const customFieldDefinitionSchema = z.object({
  key: z.string().trim().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/u),
  label: z.string().trim().min(1),
  type: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1)).optional(),
});

export const customFieldSchemaInputSchema = z.array(customFieldDefinitionSchema).superRefine((definitions, ctx) => {
  const seenKeys = new Set<string>();
  for (const [index, definition] of definitions.entries()) {
    if (seenKeys.has(definition.key)) {
      ctx.addIssue({ code: "custom", path: [index, "key"], message: `Duplicate custom field key: ${definition.key}` });
      continue;
    }
    seenKeys.add(definition.key);
  }
}).default([]);

export type CustomFieldSchemaInput = z.infer<typeof customFieldSchemaInputSchema>;

export function validateCustomFieldValues(
  definitions: readonly CustomFieldDefinition[],
  values: JsonObject | undefined,
): JsonObject {
  assertUniqueCustomFieldDefinitionKeys(definitions);
  const source = values ?? {};
  const normalized: JsonObject = {};
  const definitionKeys = new Set(definitions.map((definition) => definition.key));

  for (const key of Object.keys(source)) {
    if (!definitionKeys.has(key)) {
      throw new Error(`Unknown custom field: ${key}`);
    }
  }

  for (const definition of definitions) {
    const value = source[definition.key];
    if (value === undefined || value === null || value === "") {
      if (definition.required) {
        throw new Error(`Custom field is required: ${definition.key}`);
      }
      continue;
    }
    normalized[definition.key] = validateValue(definition, value);
  }

  return normalized;
}

export function assertUniqueCustomFieldDefinitionKeys(definitions: readonly CustomFieldDefinition[]): void {
  const seenKeys = new Set<string>();
  for (const definition of definitions) {
    if (seenKeys.has(definition.key)) {
      throw new Error(`Duplicate custom field key: ${definition.key}`);
    }
    seenKeys.add(definition.key);
  }
}

function validateValue(definition: CustomFieldDefinition, value: unknown): string | number | boolean {
  switch (definition.type) {
    case "text":
    case "textarea":
      if (typeof value === "string") {
        return value;
      }
      break;
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      break;
    case "date":
      if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
        return value;
      }
      break;
    case "url":
      if (typeof value === "string") {
        return z.url().parse(value);
      }
      break;
    case "checkbox":
      if (typeof value === "boolean") {
        return value;
      }
      break;
    case "select":
      if (typeof value === "string" && definition.options?.includes(value)) {
        return value;
      }
      break;
  }

  throw new Error(`Invalid custom field value for ${definition.key}.`);
}
