import { ATTACHMENT_TARGET_TYPES } from "@DCRM/domain";
import { z } from "zod";

import type { JsonObject } from "../../crm/types.js";

const ABSOLUTE_MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CONTENT_TYPE_PATTERN = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"(?:[\t !#-\[\]-~]|\\[\t !-~])*"))*$/u;
const HEADER_VALUE_PATTERN = /^[\x20-\x7E]+$/u;
const MAX_METADATA_BYTES = 8 * 1024;
const MAX_METADATA_DEPTH = 5;
const MAX_METADATA_KEYS = 50;
const MAX_METADATA_ARRAY_LENGTH = 50;
const MAX_METADATA_STRING_LENGTH = 1_024;
const RESERVED_METADATA_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const attachmentTargetSchema = z.object({
  targetType: z.enum(ATTACHMENT_TARGET_TYPES),
  targetId: z.string().trim().min(1),
});

export const createAttachmentSchema = attachmentTargetSchema.extend({
  fileName: z.string().trim().min(1).max(255).refine((fileName) => !isDotSegment(fileName), { message: "Attachment file name cannot be a dot segment." }),
  contentType: z.string().trim().min(1).max(255).refine(isValidAttachmentContentType, { message: "Attachment content type must be a valid MIME type." }).optional(),
  byteSize: z.number().int().positive().max(ABSOLUTE_MAX_ATTACHMENT_BYTES),
  checksum: z.string().trim().min(1).max(255).optional(),
  contentBase64: z.string().min(1).max(encodedBase64LengthForByteSize(ABSOLUTE_MAX_ATTACHMENT_BYTES)).refine(isCanonicalBase64String, { message: "Attachment content must be canonical base64." }),
  metadata: z.record(z.string(), z.unknown()).refine(isBoundedJsonMetadata, { message: "Attachment metadata must be a bounded JSON object." }).optional(),
}).superRefine((input, ctx) => {
  if (!hasExpectedEncodedLength(input.contentBase64, input.byteSize)) {
    ctx.addIssue({ code: "custom", path: ["contentBase64"], message: "Attachment base64 length does not match declared byte size." });
    return;
  }

  if (!hasExpectedBase64Padding(input.contentBase64, input.byteSize)) {
    ctx.addIssue({ code: "custom", path: ["contentBase64"], message: "Attachment base64 padding does not match declared byte size." });
  }
});

export function encodedBase64LengthForByteSize(byteSize: number): number {
  return Math.ceil(byteSize / 3) * 4;
}

export function isCanonicalBase64String(value: string): boolean {
  return value.length % 4 === 0 && BASE64_PATTERN.test(value) && hasCanonicalBase64PadBits(value);
}

export function hasCanonicalBase64PadBits(value: string): boolean {
  if (value.endsWith("==")) {
    const secondPaddedChar = value.at(-3);
    return secondPaddedChar !== undefined && (BASE64_ALPHABET.indexOf(secondPaddedChar) & 0b1111) === 0;
  }

  if (value.endsWith("=")) {
    const thirdPaddedChar = value.at(-2);
    return thirdPaddedChar !== undefined && (BASE64_ALPHABET.indexOf(thirdPaddedChar) & 0b11) === 0;
  }

  return true;
}

export function hasExpectedEncodedLength(contentBase64: string, byteSize: number): boolean {
  return contentBase64.length === encodedBase64LengthForByteSize(byteSize);
}

export function hasExpectedBase64Padding(contentBase64: string, byteSize: number): boolean {
  const expectedPadding = byteSize % 3 === 0 ? 0 : 3 - (byteSize % 3);
  if (expectedPadding === 0) {
    return !contentBase64.endsWith("=");
  }
  return contentBase64.endsWith("=".repeat(expectedPadding)) && !contentBase64.endsWith("=".repeat(expectedPadding + 1));
}

export function isDotSegment(value: string): boolean {
  return value === "." || value === "..";
}

export function isValidAttachmentContentType(value: string): boolean {
  return HEADER_VALUE_PATTERN.test(value) && CONTENT_TYPE_PATTERN.test(value);
}

export function isBoundedJsonMetadata(value: Record<string, unknown>): value is JsonObject {
  const state = { keyCount: 0 };
  if (!isJsonSafeMetadataValue(value, 0, state)) {
    return false;
  }
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_METADATA_BYTES;
  } catch {
    return false;
  }
}

function isJsonSafeMetadataValue(value: unknown, depth: number, state: { keyCount: number }): boolean {
  if (depth > MAX_METADATA_DEPTH) {
    return false;
  }
  if (value === null || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    return value.length <= MAX_METADATA_STRING_LENGTH;
  }
  if (Array.isArray(value)) {
    return value.length <= MAX_METADATA_ARRAY_LENGTH && value.every((item) => isJsonSafeMetadataValue(item, depth + 1, state));
  }
  if (typeof value !== "object") {
    return false;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return false;
  }
  const entries = Object.entries(value);
  state.keyCount += entries.length;
  if (state.keyCount > MAX_METADATA_KEYS) {
    return false;
  }
  return entries.every(([key, nestedValue]) => isSafeMetadataKey(key) && isJsonSafeMetadataValue(nestedValue, depth + 1, state));
}

function isSafeMetadataKey(key: string): boolean {
  return key.length > 0 && key.length <= 128 && !RESERVED_METADATA_KEYS.has(key) && HEADER_VALUE_PATTERN.test(key);
}
