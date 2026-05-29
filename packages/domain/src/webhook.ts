import { z } from "zod";

// --- Outgoing Webhook Auth Modes ---

export const OUTGOING_WEBHOOK_AUTH_MODES = {
  BEARER: "bearer",
  BASIC: "basic",
  HMAC: "hmac",
  CUSTOM_HEADERS: "custom_headers",
} as const;

export type OutgoingWebhookAuthModeKey = keyof typeof OUTGOING_WEBHOOK_AUTH_MODES;

export type OutgoingWebhookAuthMode = (typeof OUTGOING_WEBHOOK_AUTH_MODES)[OutgoingWebhookAuthModeKey];

export const OUTGOING_WEBHOOK_AUTH_MODE_VALUES: readonly OutgoingWebhookAuthMode[] =
  Object.values(OUTGOING_WEBHOOK_AUTH_MODES);

export const outgoingWebhookAuthModeSchema = z.enum([
  OUTGOING_WEBHOOK_AUTH_MODES.BEARER,
  OUTGOING_WEBHOOK_AUTH_MODES.BASIC,
  OUTGOING_WEBHOOK_AUTH_MODES.HMAC,
  OUTGOING_WEBHOOK_AUTH_MODES.CUSTOM_HEADERS,
]);

// --- Incoming Webhook Modes ---

export const INCOMING_WEBHOOK_MODES = {
  TEST: "test",
  LIVE: "live",
} as const;

export type IncomingWebhookModeKey = keyof typeof INCOMING_WEBHOOK_MODES;

export type IncomingWebhookMode = (typeof INCOMING_WEBHOOK_MODES)[IncomingWebhookModeKey];

export const INCOMING_WEBHOOK_MODE_VALUES: readonly IncomingWebhookMode[] =
  Object.values(INCOMING_WEBHOOK_MODES);

export const incomingWebhookModeSchema = z.enum([
  INCOMING_WEBHOOK_MODES.TEST,
  INCOMING_WEBHOOK_MODES.LIVE,
]);
