import { z } from "zod";

// --- Field mapping types ---

/**
 * Defines how an AI output field maps to a CRM entity field.
 * Key = path in the AI structured output (dot notation).
 * Value = target CRM entity field name.
 */
export type FieldMapping = Record<string, string>;

/**
 * Result of applying field mapping to structured AI output.
 */
export type FieldMappingResult = {
  /** Mapped fields ready to be applied to the CRM entity. */
  readonly fields: Record<string, unknown>;
  /** Fields from the AI output that could not be mapped. */
  readonly unmapped: Record<string, unknown>;
  /** Total number of fields in the AI output. */
  readonly totalFields: number;
  /** Number of fields successfully mapped. */
  readonly mappedCount: number;
};

/**
 * Resolve a nested value from an object using dot-notation path.
 */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Apply field mapping to a structured AI output.
 *
 * Maps values from the AI output to CRM entity field names.
 * Returns mapped fields, unmapped fields, and mapping statistics.
 *
 * - Only non-null/undefined values are mapped.
 * - Dot-notation paths in the mapping key are resolved from nested output.
 * - If a mapping target field already has a value in existingFields
 *   and overwrite is false, the mapping is skipped.
 */
export function applyFieldMapping(
  aiOutput: Record<string, unknown>,
  mapping: FieldMapping,
  options?: {
    readonly existingFields?: Record<string, unknown>;
    readonly overwrite?: boolean;
  },
): FieldMappingResult {
  const overwrite = options?.overwrite ?? true;
  const existing = options?.existingFields ?? {};
  const fields: Record<string, unknown> = {};
  const unmapped: Record<string, unknown> = {};
  let mappedCount = 0;

  // Collect all leaf values from the AI output
  const allOutputKeys = collectLeafKeys(aiOutput);

  const mappedOutputKeys = new Set<string>();

  for (const [outputPath, targetField] of Object.entries(mapping)) {
    const value = resolvePath(aiOutput, outputPath);

    if (value === undefined || value === null) {
      continue;
    }

    mappedOutputKeys.add(outputPath);

    // Check if we should skip (existing value and not overwriting)
    if (!overwrite && targetField in existing && existing[targetField] !== null && existing[targetField] !== undefined) {
      continue;
    }

    fields[targetField] = value;
    mappedCount++;
  }

  // Collect unmapped output fields
  for (const key of allOutputKeys) {
    if (!mappedOutputKeys.has(key)) {
      const value = resolvePath(aiOutput, key);
      if (value !== undefined && value !== null) {
        unmapped[key] = value;
      }
    }
  }

  return {
    fields,
    unmapped,
    totalFields: allOutputKeys.length,
    mappedCount,
  };
}

/**
 * Recursively collect all leaf key paths from a nested object using dot notation.
 */
function collectLeafKeys(
  obj: Record<string, unknown>,
  prefix = "",
): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectLeafKeys(value as Record<string, unknown>, fullPath));
    } else {
      keys.push(fullPath);
    }
  }

  return keys;
}

/**
 * Schema for validating field mapping configurations.
 * Ensures keys and values are non-empty strings.
 */
export const fieldMappingSchema: z.ZodType<FieldMapping> = z.record(
  z.string().min(1),
  z.string().min(1),
);

/**
 * Build an AI hook config with field mapping.
 */
export function buildHookFieldMapping(
  _templateId: string,
  overrides?: Record<string, string>,
): FieldMapping {
  // Template-based mapping will be resolved at execution time
  // This is a helper for constructing mapping configs
  return overrides ?? {};
}
