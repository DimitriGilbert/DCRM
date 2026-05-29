import { describe, expect, it } from "vitest";

describe("Outgoing webhook auth modes", () => {
  it("exports all required auth modes from PRD", async () => {
    const { OUTGOING_WEBHOOK_AUTH_MODES } = await import("../src/webhook");

    expect(OUTGOING_WEBHOOK_AUTH_MODES).toEqual({
      BEARER: "bearer",
      BASIC: "basic",
      HMAC: "hmac",
      CUSTOM_HEADERS: "custom_headers",
    });
  });

  it("validates correct auth modes via schema", async () => {
    const { OUTGOING_WEBHOOK_AUTH_MODES, outgoingWebhookAuthModeSchema } = await import("../src/webhook");

    for (const mode of Object.values(OUTGOING_WEBHOOK_AUTH_MODES)) {
      expect(outgoingWebhookAuthModeSchema.safeParse(mode).success).toBe(true);
    }
  });

  it("rejects invalid auth mode values", async () => {
    const { outgoingWebhookAuthModeSchema } = await import("../src/webhook");

    expect(outgoingWebhookAuthModeSchema.safeParse("oauth").success).toBe(false);
  });
});

describe("Incoming webhook modes", () => {
  it("exports all required incoming webhook modes from PRD", async () => {
    const { INCOMING_WEBHOOK_MODES } = await import("../src/webhook");

    expect(INCOMING_WEBHOOK_MODES).toEqual({
      TEST: "test",
      LIVE: "live",
    });
  });

  it("validates correct incoming webhook modes via schema", async () => {
    const { INCOMING_WEBHOOK_MODES, incomingWebhookModeSchema } = await import("../src/webhook");

    for (const mode of Object.values(INCOMING_WEBHOOK_MODES)) {
      expect(incomingWebhookModeSchema.safeParse(mode).success).toBe(true);
    }
  });

  it("rejects invalid incoming webhook mode values", async () => {
    const { incomingWebhookModeSchema } = await import("../src/webhook");

    expect(incomingWebhookModeSchema.safeParse("disabled").success).toBe(false);
  });
});
