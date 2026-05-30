import type { ZodType } from "zod";
import { convertSchemaToJsonSchema } from "@tanstack/ai";

/**
 * Converts a Zod schema to a JSON Schema suitable for TanStack AI structured output.
 */
export function zodToJsonSchema<T>(
  schema: ZodType<T>,
): Record<string, unknown> {
  return convertSchemaToJsonSchema(schema) as Record<string, unknown>;
}

/**
 * Validates structured output against a Zod schema.
 * Returns the parsed result or throws a validation error.
 */
export function validateStructuredOutput<T>(
  rawOutput: unknown,
  schema: ZodType<T>,
): T {
  return schema.parse(rawOutput) as T;
}

/**
 * Safely validates structured output, returning a result object instead of throwing.
 */
export function safeValidateStructuredOutput<T>(
  rawOutput: unknown,
  schema: ZodType<T>,
): { success: true; data: T } | { success: false; error: Error } {
  const result = schema.safeParse(rawOutput);
  if (result.success) {
    return { success: true, data: result.data as T };
  }
  return { success: false, error: result.error };
}

/**
 * Builds a structured output configuration for TanStack AI's chat function.
 * Combines JSON Schema generation with Zod validation.
 */
export function buildStructuredOutputConfig<T>(
  schema: ZodType<T>,
  _description?: string,
): {
  schema: Record<string, unknown>;
  validate: (raw: unknown) => T;
} {
  return {
    schema: zodToJsonSchema(schema),
    validate: (raw: unknown) => validateStructuredOutput(raw, schema),
  };
}
