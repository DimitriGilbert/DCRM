import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { isCoreEventType } from "@DCRM/events";
import { z } from "zod";

import type { DcrmEvent, EventService, JsonObject } from "@DCRM/events";

import type { AutomationRepository, IncomingWebhookSafeRecord } from "./repository.js";

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), z.unknown());

const mappingEntrySchema = z.object({
  sourcePath: z.string().trim().min(1),
  targetPath: z.string().trim().min(1).superRefine((value, ctx) => {
    const unsafeSegment = findUnsafeTargetPathSegment(value);
    if (unsafeSegment) {
      ctx.addIssue({ code: "custom", message: `Incoming webhook target path segment is not allowed: ${unsafeSegment}` });
    }
  }),
});

const mappingConfigSchema = z.object({
  mappings: z.array(mappingEntrySchema).default([]),
});

export type IncomingWebhookReceiveInput = {
  readonly slug: string;
  readonly token: string | null;
  readonly payload: JsonObject;
};

export type IncomingWebhookReceiveResult = {
  readonly mode: "test" | "live";
  readonly preview: JsonObject;
  readonly emittedEvent: DcrmEvent | null;
};

export type CreateIncomingWebhookServiceOptions = {
  readonly automationRepository: AutomationRepository;
  readonly eventService: EventService;
  readonly tokenHasher?: (token: string) => string;
  readonly clock?: () => Date;
};

export function createIncomingWebhookService({ automationRepository, eventService, tokenHasher = hashIncomingWebhookToken, clock = () => new Date() }: CreateIncomingWebhookServiceOptions) {
  return {
    async receive(input: IncomingWebhookReceiveInput): Promise<IncomingWebhookReceiveResult> {
      const webhook = await automationRepository.incomingWebhooks.getBySlug(input.slug.trim());
      if (!webhook || !webhook.enabled) {
        throw new IncomingWebhookNotFoundError();
      }
      verifyIncomingWebhookToken({ providedToken: input.token, expectedHash: webhook.tokenHash, tokenHasher });
      let preview: JsonObject;
      try {
        preview = mapIncomingWebhookPayload(webhook.mappingConfig, input.payload);
      } catch (error) {
        throw new IncomingWebhookPayloadMappingError(error);
      }

      if (webhook.mode === "test") {
        await automationRepository.incomingWebhooks.recordTestPayload({ id: webhook.id, payload: input.payload, now: clock() });
        return { mode: "test", preview, emittedEvent: null };
      }

      const emittedEvent = await eventService.emitWebhook({
        type: webhook.targetEventType,
        userId: webhook.userId,
        entity: { type: "webhook", id: webhook.id },
        payload: { ...preview, webhook: { id: webhook.id, slug: webhook.slug } },
        metadata: { incomingWebhookId: webhook.id },
      });
      return { mode: "live", preview, emittedEvent };
    },
  };
}

export function mapIncomingWebhookPayload(mappingConfig: JsonObject, payload: JsonObject): JsonObject {
  const parsed = mappingConfigSchema.parse(mappingConfig);
  const output = createNullPrototypeRecord();
  for (const mapping of parsed.mappings) {
    const value = readJsonPath(payload, mapping.sourcePath);
    if (value !== undefined) {
      writeTargetPath(output, mapping.targetPath, value);
    }
  }
  return jsonObjectSchema.parse(toPlainJsonObject(output));
}

export function createIncomingWebhookToken(): string {
  return `dcrm_wh_${randomBytes(24).toString("base64url")}`;
}

export function hashIncomingWebhookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyIncomingWebhookToken(input: { readonly providedToken: string | null; readonly expectedHash: string | null; readonly tokenHasher?: (token: string) => string }): void {
  if (!input.expectedHash) {
    return;
  }
  if (!input.providedToken) {
    throw new IncomingWebhookAuthenticationError();
  }
  const actual = Buffer.from((input.tokenHasher ?? hashIncomingWebhookToken)(input.providedToken), "utf8");
  const expected = Buffer.from(input.expectedHash, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new IncomingWebhookAuthenticationError();
  }
}

export class IncomingWebhookAuthenticationError extends Error {
  constructor() {
    super("Invalid incoming webhook credentials.");
    this.name = "IncomingWebhookAuthenticationError";
  }
}

export class IncomingWebhookNotFoundError extends Error {
  constructor() {
    super("Incoming webhook was not found.");
    this.name = "IncomingWebhookNotFoundError";
  }
}

export class IncomingWebhookPayloadMappingError extends Error {
  readonly error: unknown;

  constructor(error: unknown) {
    super("Incoming webhook payload could not be mapped.");
    this.name = "IncomingWebhookPayloadMappingError";
    this.error = error;
  }
}

export function normalizeIncomingWebhookCreate(input: {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly slug: string;
  readonly token: string | null;
  readonly targetEventType: string;
  readonly mappingConfig: JsonObject;
  readonly now: Date;
}): Parameters<AutomationRepository["incomingWebhooks"]["create"]>[0] & { readonly rawToken: string | null } {
  const targetEventType = input.targetEventType.trim();
  if (!isCoreEventType(targetEventType)) {
    throw new Error(`Unsupported incoming webhook event type: ${targetEventType}`);
  }
  mappingConfigSchema.parse(input.mappingConfig);
  const rawToken = input.token?.trim() || createIncomingWebhookToken();
  return {
    id: input.id,
    userId: input.userId,
    name: input.name.trim(),
    slug: normalizeSlug(input.slug),
    enabled: true,
    mode: "test",
    tokenHash: hashIncomingWebhookToken(rawToken),
    mappingConfig: input.mappingConfig,
    targetEventType,
    now: input.now,
    rawToken,
  };
}

export type IncomingWebhookCreatedWithToken = IncomingWebhookSafeRecord & { readonly token: string | null };

function readJsonPath(value: unknown, path: string): unknown {
  const segments = parseJsonPath(path);
  let current = value;
  for (const segment of segments) {
    if (typeof segment === "number") {
      current = Array.isArray(current) ? current[segment] : undefined;
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function writeTargetPath(output: Record<string, unknown>, targetPath: string, value: unknown): void {
  const segments = parseTargetPath(targetPath);
  if (segments.length === 0) {
    throw new Error("Target path is required.");
  }
  let cursor: Record<string, unknown> = output;
  for (const segment of segments.slice(0, -1)) {
    const existing = Object.hasOwn(cursor, segment) ? cursor[segment] : undefined;
    if (!isSafePlainRecord(existing)) {
      cursor[segment] = createNullPrototypeRecord();
    }
    const next = cursor[segment];
    if (!isSafePlainRecord(next)) {
      throw new Error(`Target path cannot be written: ${targetPath}`);
    }
    cursor = next;
  }
  const finalSegment = segments.at(-1);
  if (!finalSegment) {
    throw new Error("Target path is required.");
  }
  cursor[finalSegment] = value;
}

export function assertSafeIncomingWebhookTargetPath(targetPath: string): void {
  parseTargetPath(targetPath);
}

function parseTargetPath(targetPath: string): readonly string[] {
  const segments = targetPath.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Target path is required.");
  }
  for (const segment of segments) {
    if (isDangerousTargetPathSegment(segment)) {
      throw new Error(`Incoming webhook target path segment is not allowed: ${segment}`);
    }
  }
  return segments;
}

function findUnsafeTargetPathSegment(targetPath: string): string | undefined {
  const segments = targetPath.split(".").map((segment) => segment.trim()).filter(Boolean);
  return segments.find(isDangerousTargetPathSegment);
}

function isDangerousTargetPathSegment(segment: string): boolean {
  return segment === "__proto__" || segment === "constructor" || segment === "prototype";
}

function createNullPrototypeRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function toPlainJsonObject(value: Record<string, unknown>): JsonObject {
  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = isSafePlainRecord(nestedValue) ? toPlainJsonObject(nestedValue) : nestedValue;
  }
  return jsonObjectSchema.parse(output);
}

function parseJsonPath(path: string): readonly (string | number)[] {
  const normalized = path.trim().startsWith("$.") ? path.trim().slice(2) : path.trim();
  if (normalized.length === 0 || normalized === "$") {
    return [];
  }
  return normalized.split(".").flatMap((part) => {
    const segments: (string | number)[] = [];
    const match = /^(?<name>[^[]+)(?:\[(?<index>\d+)\])?$/.exec(part);
    const name = match?.groups?.name;
    if (!name) {
      throw new Error(`Unsupported JSON path segment: ${part}`);
    }
    segments.push(name);
    const index = match.groups?.index;
    if (index !== undefined) {
      segments.push(Number.parseInt(index, 10));
    }
    return segments;
  });
}

function normalizeSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (normalized.length < 3 || normalized.length > 120) {
    throw new Error("Incoming webhook slug must be between 3 and 120 URL-safe characters.");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafePlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === null || prototype === Object.prototype;
}
