import { createHmac } from "node:crypto";
import { z } from "zod";

import type { EncryptedSecretV1, SecretCrypto } from "@DCRM/crypto";
import type { DcrmEvent, JsonObject } from "@DCRM/events";
import { NonRetryableHookExecutionError } from "@DCRM/events/hooks";
import type { HookExecutionContext, HookExecutor } from "@DCRM/events/hooks";

import { parseSafeOutgoingWebhookUrl } from "./outgoing-webhook-url.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type CreateOutgoingWebhookExecutorOptions = {
  readonly secretCrypto: SecretCrypto;
  readonly fetch?: FetchLike;
};

const encryptedSecretSchema: z.ZodType<EncryptedSecretV1> = z.object({
  version: z.literal("dcrm.secret.v1"),
  algorithm: z.literal("aes-256-gcm"),
  encoding: z.literal("base64"),
  ciphertext: z.string(),
  iv: z.string(),
  authTag: z.string(),
});

const customHeaderSchema = z.object({
  name: z.string().trim().min(1).max(128),
  value: encryptedSecretSchema,
});

const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), token: encryptedSecretSchema }),
  z.object({ type: z.literal("basic"), username: z.string().min(1).max(256), password: encryptedSecretSchema }),
  z.object({ type: z.literal("hmac"), secret: encryptedSecretSchema, headerName: z.string().trim().min(1).max(128).default("X-DCRM-Signature") }),
  z.object({ type: z.literal("custom_headers"), headers: z.array(customHeaderSchema).min(1).max(20) }),
]);

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoff: z.object({
    type: z.enum(["fixed", "exponential"]),
    delayMs: z.number().int().min(0).max(86_400_000),
  }),
});

const configSchema = z.object({
  url: z.url(),
  auth: authSchema.default({ type: "none" }),
  headers: z.record(z.string().trim().min(1).max(128), z.string().max(1_024)).default({}),
  retryPolicy: retryPolicySchema.optional(),
});

export function createOutgoingWebhookExecutor({ secretCrypto, fetch: fetchImplementation = fetch }: CreateOutgoingWebhookExecutorOptions): HookExecutor {
  return {
    async execute(context) {
      if (context.hook.type !== "outgoing_webhook") {
        return { skipped: true, reason: "unsupported_hook_type" };
      }

      const config = parseWebhookConfig(context.hook.config);
      const url = parseWebhookUrl(config.url);
      const body = JSON.stringify(createWebhookPayload(context));
      const headers = new Headers({
        "content-type": "application/json",
        "user-agent": "DCRM-Outgoing-Webhooks/1.0",
      });
      applyValidatedHeaders({ headers, body, config, secretCrypto });

      const response = await sendWebhookRequest(fetchImplementation, url, headers, body);

      const output = { delivery: { status: response.ok ? "delivered" : "failed", statusCode: response.status, attempt: context.attempt } };
      if (response.ok) {
        return output;
      }
      if (isTransientStatus(response.status)) {
        throw new OutgoingWebhookTransientError(response.status);
      }
      const permanentError = new OutgoingWebhookPermanentError(response.status);
      throw new NonRetryableHookExecutionError(permanentError.message, permanentError);
    },
  };
}

function parseWebhookConfig(value: unknown): z.infer<typeof configSchema> {
  try {
    return configSchema.parse(value);
  } catch (error) {
    throw new NonRetryableHookExecutionError("Outgoing webhook configuration is invalid.", error);
  }
}

function parseWebhookUrl(value: string): URL {
  try {
    return parseSafeOutgoingWebhookUrl(value);
  } catch (error) {
    throw new NonRetryableHookExecutionError(errorMessage(error), error);
  }
}

function applyValidatedHeaders(input: { readonly headers: Headers; readonly body: string; readonly config: z.infer<typeof configSchema>; readonly secretCrypto: SecretCrypto }) {
  try {
    for (const [name, value] of Object.entries(input.config.headers)) {
      setSafeHeader(input.headers, name, value);
    }
    applyAuthHeaders({ headers: input.headers, body: input.body, auth: input.config.auth, secretCrypto: input.secretCrypto });
  } catch (error) {
    throw new NonRetryableHookExecutionError(errorMessage(error), error);
  }
}

async function sendWebhookRequest(fetchImplementation: FetchLike, url: URL, headers: Headers, body: string): Promise<Response> {
  try {
    return await fetchImplementation(url.toString(), {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OutgoingWebhookTransientError(0);
  }
}

export class OutgoingWebhookTransientError extends Error {
  constructor(statusCode: number) {
    super(`Outgoing webhook transient failure: HTTP ${statusCode}`);
    this.name = "OutgoingWebhookTransientError";
  }
}

class OutgoingWebhookPermanentError extends Error {
  constructor(statusCode: number) {
    super(`Outgoing webhook permanent failure: HTTP ${statusCode}`);
    this.name = "OutgoingWebhookPermanentError";
  }
}

function applyAuthHeaders(input: { readonly headers: Headers; readonly body: string; readonly auth: z.infer<typeof authSchema>; readonly secretCrypto: SecretCrypto }) {
  switch (input.auth.type) {
    case "none":
      return;
    case "bearer":
      input.headers.set("authorization", `Bearer ${input.secretCrypto.decrypt(input.auth.token)}`);
      return;
    case "basic": {
      const password = input.secretCrypto.decrypt(input.auth.password);
      input.headers.set("authorization", `Basic ${Buffer.from(`${input.auth.username}:${password}`, "utf8").toString("base64")}`);
      return;
    }
    case "hmac": {
      const secret = input.secretCrypto.decrypt(input.auth.secret);
      setSafeHeader(input.headers, input.auth.headerName, createHmac("sha256", secret).update(input.body).digest("hex"));
      return;
    }
    case "custom_headers":
      for (const header of input.auth.headers) {
        setSafeHeader(input.headers, header.name, input.secretCrypto.decrypt(header.value));
      }
      return;
  }
}

function createWebhookPayload(context: HookExecutionContext): JsonObject {
  return {
    event: eventToJsonObject(context.event),
    hook: {
      id: context.hook.id,
      name: context.hook.name,
      type: context.hook.type,
    },
    execution: {
      id: context.execution.id,
      attempt: context.attempt,
    },
  };
}

function eventToJsonObject(event: DcrmEvent): JsonObject {
  return {
    id: event.id,
    type: event.type,
    userId: event.userId,
    source: event.source,
    ...(event.entity ? { entity: event.entity } : {}),
    payload: event.payload,
    ...(event.changes ? { changes: event.changes } : {}),
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  };
}

function setSafeHeader(headers: Headers, name: string, value: string) {
  const normalizedName = name.trim();
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(normalizedName)) {
    throw new Error("Outgoing webhook header name is invalid.");
  }
  const lower = normalizedName.toLowerCase();
  if (lower === "host" || lower === "content-length" || lower === "connection") {
    throw new Error("Outgoing webhook header is not allowed.");
  }
  headers.set(normalizedName, value);
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Outgoing webhook validation failed.";
}
