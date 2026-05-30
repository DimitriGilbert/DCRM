/**
 * Incoming webhook endpoint handler.
 *
 * Handles secret/token verification, JSON path mapping, and
 * test/live mode behavior for incoming webhooks.
 *
 * Incoming webhooks create internal DCRM events — they do NOT
 * directly mutate CRM records.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { EventPersister, EmitEventInput } from "@DCRM/events";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";

import {
  mapPayload,
  validateMappingConfig,
  type MappingConfig,
  type MappingResult,
} from "./mapper";

// --- Incoming webhook record (matches DB row) ---

export type IncomingWebhookRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly urlToken: string;
  readonly secret: string | null;
  readonly mode: "test" | "live";
  readonly mappingConfig: MappingConfig | null;
  readonly enabled: boolean;
  readonly lastReceivedAt: Date | null;
};

// --- Verification result ---

export type VerificationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

// --- Handler result ---

export type IncomingWebhookResult = {
  /** Whether the webhook was accepted. */
  readonly accepted: boolean;
  /** HTTP status code to return. */
  readonly statusCode: number;
  /** Response body. */
  readonly body: Record<string, unknown>;
  /** In test mode, the preview of the mapped payload. */
  readonly preview?: MappingResult;
};

// --- Dependencies ---

export type IncomingWebhookDeps = {
  /** Lookup an incoming webhook by its URL token. */
  readonly findByToken: (token: string) => Promise<IncomingWebhookRecord | null>;
  /** Update the lastReceivedAt timestamp on the webhook. */
  readonly updateLastReceived: (id: string) => Promise<void>;
  /** Event persister for emitting events (only used in live mode). */
  readonly persister: EventPersister;
};

// --- Secret verification ---

/**
 * Verifies the incoming webhook request against the stored secret.
 *
 * Supports two modes:
 *   - Token-in-URL: No secret required, the urlToken itself is the auth.
 *   - HMAC signature: If a secret is stored, the request body must be
 *     signed with it. The signature is expected in the X-DCRM-Signature header
 *     as a hex-encoded SHA-256 HMAC.
 *
 * Timing-safe comparison prevents timing attacks.
 */
export function verifyRequest(
  body: string,
  secret: string | null,
  signatureHeader: string | null,
): VerificationResult {
  // If no secret is configured, the URL token alone is sufficient
  if (secret === null || secret.length === 0) {
    return { valid: true };
  }

  // Secret is configured — signature header is required
  if (signatureHeader === null || signatureHeader.length === 0) {
    return {
      valid: false,
      reason: "Missing X-DCRM-Signature header",
    };
  }

  // Compute expected HMAC-SHA256
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  // Timing-safe comparison
  if (
    expected.length !== signatureHeader.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
  ) {
    return {
      valid: false,
      reason: "Invalid signature",
    };
  }

  return { valid: true };
}

// --- Main handler ---

/**
 * Processes an incoming webhook request.
 *
 * Flow:
 *   1. Lookup webhook by URL token
 *   2. Verify secret/signature if configured
 *   3. Parse payload as JSON
 *   4. Apply mapping config
 *   5. In test mode: return preview only (no event emitted)
 *   6. In live mode: emit a normalized internal event
 *
 * @param urlToken - The unique token from the webhook URL path
 * @param rawBody - The raw request body as a string
 * @param signatureHeader - The X-DCRM-Signature header value (or null)
 * @param deps - Dependencies for DB access and event emission
 */
export async function handleIncomingWebhook(
  urlToken: string,
  rawBody: string,
  signatureHeader: string | null,
  deps: IncomingWebhookDeps,
): Promise<IncomingWebhookResult> {
  // 1. Lookup webhook
  const webhook = await deps.findByToken(urlToken);

  if (webhook === null) {
    return {
      accepted: false,
      statusCode: 404,
      body: { error: "Webhook not found" },
    };
  }

  if (!webhook.enabled) {
    return {
      accepted: false,
      statusCode: 410,
      body: { error: "Webhook not found" },
    };
  }

  // 3. Verify secret/signature
  const verification = verifyRequest(rawBody, webhook.secret, signatureHeader);
  if (!verification.valid) {
    return {
      accepted: false,
      statusCode: 401,
      body: { error: verification.reason },
    };
  }

  // 4. Parse body as JSON
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        accepted: false,
        statusCode: 400,
        body: { error: "Request body must be a JSON object" },
      };
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return {
      accepted: false,
      statusCode: 400,
      body: { error: "Invalid JSON in request body" },
    };
  }

  // 5. Apply mapping config
  if (webhook.mappingConfig === null) {
    return {
      accepted: false,
      statusCode: 422,
      body: { error: "No mapping configuration defined" },
    };
  }

  // Validate mapping config structure
  const configErrors = validateMappingConfig(webhook.mappingConfig);
  if (configErrors.length > 0) {
    return {
      accepted: false,
      statusCode: 422,
      body: { error: "Invalid mapping configuration", details: configErrors },
    };
  }

  const mappingResult = mapPayload(payload, webhook.mappingConfig);

  if (webhook.mode === "test") {
    await deps.updateLastReceived(webhook.id);
    return {
      accepted: true,
      statusCode: 200,
      body: {
        mode: "test",
        message: "Webhook received in test mode — preview only",
        eventType: webhook.mappingConfig.eventType,
        mapping: {
          success: mappingResult.success,
          payload: mappingResult.payload,
          errors: mappingResult.errors,
        },
      },
      preview: mappingResult,
    };
  }

  if (!mappingResult.success) {
    return {
      accepted: false,
      statusCode: 422,
      body: {
        error: "Mapping produced errors — event not emitted",
        mappingErrors: mappingResult.errors,
      },
      preview: mappingResult,
    };
  }

  const eventInput: EmitEventInput = {
    type: EVENT_TYPE.WEBHOOK_RECEIVED,
    userId: webhook.userId,
    source: "webhook",
    payload: {
      webhookId: webhook.id,
      webhookName: webhook.name,
      mappedEventType: webhook.mappingConfig.eventType,
      mappedPayload: mappingResult.payload,
      rawPayload: payload,
    },
  };

  // Known non-atomicity gap: if the process crashes between emitEvent and
  // updateLastReceived, the event is emitted but lastReceivedAt is not updated.
  // On retry, the same webhook payload could produce a duplicate event.
  // Full fix (idempotent event emission keyed on webhookId+request hash)
  // is deferred to a future iteration.
  const event = await emitEvent(deps.persister, eventInput);

  await deps.updateLastReceived(webhook.id);

  return {
    accepted: true,
    statusCode: 200,
    body: {
      mode: "live",
      message: "Webhook received and event emitted",
      eventId: event.id,
      eventType: event.type,
    },
  };
}
