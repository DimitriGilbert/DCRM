/**
 * JSON path mapping engine for incoming webhooks.
 *
 * Extracts values from external payloads using JSON path selectors
 * and maps them to normalized DCRM event fields.
 *
 * Mapping config is stored as JSON so it can be exported, imported,
 * and versioned.
 */

// --- Mapping configuration ---

/**
 * A single field mapping rule: extract a value from the source payload
 * at the given JSON path and place it at the target field name.
 */
export type FieldMapping = {
  /** JSON path into the source payload, e.g. "data.user.email". */
  readonly sourcePath: string;
  /** Target field name in the normalized event payload. */
  readonly targetField: string;
  /** Optional default value if the source path resolves to undefined. */
  readonly defaultValue?: unknown;
  /** Optional type coercion: "string" | "number" | "boolean". */
  readonly coerce?: "string" | "number" | "boolean";
};

/**
 * Full mapping configuration stored on an incoming webhook.
 */
export type MappingConfig = {
  /** Target event type to emit, e.g. "exchange.created". */
  readonly eventType: string;
  /** Field mapping rules. */
  readonly fields: readonly FieldMapping[];
  /** Optional static values to merge into every mapped payload. */
  readonly staticPayload?: Record<string, unknown>;
};

/**
 * Result of applying a mapping config to a payload.
 */
export type MappingResult = {
  /** Whether the mapping succeeded (all required paths resolved). */
  readonly success: boolean;
  /** The mapped event payload. */
  readonly payload: Record<string, unknown>;
  /** Errors encountered during mapping (missing required paths, coercion failures). */
  readonly errors: readonly MappingError[];
};

export type MappingError = {
  readonly targetField: string;
  readonly sourcePath: string;
  readonly message: string;
};

// --- JSON path extraction ---

/**
 * Extracts a value from a nested object using a dot-separated path.
 *
 * Supports:
 *   - Simple paths: "data.user.email"
 *   - Array indexing: "items[0].name"
 *   - Mixed: "data.contacts[0].email"
 *
 * Returns undefined if the path cannot be fully resolved.
 */
export function extractValue(
  payload: Record<string, unknown>,
  path: string,
): unknown {
  if (path === "" || path === ".") {
    return payload;
  }

  // Split path into segments, handling array indices like "items[0]"
  const segments = parsePath(path);

  let current: unknown = payload;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (segment.type === "index") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment.value];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment.key];
    }
  }

  return current;
}

type PathSegment =
  | { type: "key"; key: string }
  | { type: "index"; value: number };

function parsePath(path: string): readonly PathSegment[] {
  const segments: PathSegment[] = [];

  // Split on dots, but handle array brackets
  const parts = path.split(".");

  for (const part of parts) {
    // Check for array notation like "items[0]"
    const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = Number(arrayMatch[2]);
      if (key) {
        segments.push({ type: "key", key });
      }
      segments.push({ type: "index", value: index });
    } else {
      segments.push({ type: "key", key: part });
    }
  }

  return segments;
}

// --- Type coercion ---

function coerceValue(value: unknown, type: "string" | "number" | "boolean"): unknown {
  switch (type) {
    case "string":
      if (value === null || value === undefined) return undefined;
      return String(value);
    case "number": {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const num = Number(value);
        if (Number.isNaN(num)) {
          throw new Error(`Cannot coerce "${value}" to number`);
        }
        return num;
      }
      throw new Error(`Cannot coerce ${typeof value} to number`);
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower === "true" || lower === "1") return true;
        if (lower === "false" || lower === "0") return false;
        throw new Error(`Cannot coerce string "${value}" to boolean`);
      }
      if (typeof value === "number") return value !== 0;
      throw new Error(`Cannot coerce ${typeof value} to boolean`);
    }
    default: {
      const _: never = type;
      void _;
      return value;
    }
  }
}

// --- Main mapping function ---

/**
 * Applies a mapping configuration to an incoming webhook payload,
 * producing a normalized event payload.
 *
 * In test mode, this function is called to preview the result without
 * emitting an event. In live mode, the result is used to create an event.
 */
export function mapPayload(
  payload: Record<string, unknown>,
  config: MappingConfig,
): MappingResult {
  const result: Record<string, unknown> = {};
  const errors: MappingError[] = [];

  // Apply static payload first
  if (config.staticPayload) {
    Object.assign(result, config.staticPayload);
  }

  // Apply field mappings
  for (const field of config.fields) {
    let value = extractValue(payload, field.sourcePath);

    if (value === undefined) {
      if (field.defaultValue !== undefined) {
        value = field.defaultValue;
      } else {
        // No value and no default — record error but continue
        errors.push({
          targetField: field.targetField,
          sourcePath: field.sourcePath,
          message: `Path "${field.sourcePath}" resolved to undefined with no default`,
        });
        continue;
      }
    }

    // Apply type coercion if specified
    if (field.coerce !== undefined && value !== undefined) {
      try {
        value = coerceValue(value, field.coerce);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          targetField: field.targetField,
          sourcePath: field.sourcePath,
          message: `Coercion to ${field.coerce} failed: ${message}`,
        });
        continue;
      }
    }

    result[field.targetField] = value;
  }

  return {
    success: errors.length === 0,
    payload: result,
    errors,
  };
}

/**
 * Validates that a mapping config is well-formed.
 * Returns an array of validation error messages (empty if valid).
 */
export function validateMappingConfig(config: unknown): readonly string[] {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null) {
    return ["Mapping config must be an object"];
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg["eventType"] !== "string" || cfg["eventType"].length === 0) {
    errors.push("eventType must be a non-empty string");
  }

  if (!Array.isArray(cfg["fields"])) {
    errors.push("fields must be an array");
  } else {
    for (let i = 0; i < cfg["fields"].length; i++) {
      const field = cfg["fields"][i] as Record<string, unknown> | undefined;
      if (!field || typeof field !== "object") {
        errors.push(`fields[${i}] must be an object`);
        continue;
      }
      if (typeof field["sourcePath"] !== "string" || field["sourcePath"].length === 0) {
        errors.push(`fields[${i}].sourcePath must be a non-empty string`);
      }
      if (typeof field["targetField"] !== "string" || field["targetField"].length === 0) {
        errors.push(`fields[${i}].targetField must be a non-empty string`);
      }
      if (
        field["coerce"] !== undefined &&
        field["coerce"] !== "string" &&
        field["coerce"] !== "number" &&
        field["coerce"] !== "boolean"
      ) {
        errors.push(`fields[${i}].coerce must be "string", "number", or "boolean"`);
      }
    }
  }

  if (
    cfg["staticPayload"] !== undefined &&
    (typeof cfg["staticPayload"] !== "object" || cfg["staticPayload"] === null)
  ) {
    errors.push("staticPayload must be an object if provided");
  }

  return errors;
}
