import { describe, it, expect, vi } from "vitest";

import {
  sendPlainEmail,
  LOOP_PREVENTION_HEADER,
  type SmtpTransport,
} from "../src/smtp";

// ── Fixtures ─────────────────────────────────────────────────────────────

function createMockTransport(): SmtpTransport {
  return {
    send: vi.fn().mockResolvedValue({ messageId: "<sent-001@dcrm.com>" }),
  };
}

// ── sendPlainEmail ───────────────────────────────────────────────────────

describe("sendPlainEmail", () => {
  it("sends a plain-text email with loop-prevention header", async () => {
    const transport = createMockTransport();

    const result = await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "Test Subject",
      body: "Hello, this is a test.",
    });

    expect(result.messageId).toBe("<sent-001@dcrm.com>");
    expect(result.sentAt).toBeInstanceOf(Date);

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "me@dcrm.com",
        to: "client@example.com",
        subject: "Test Subject",
        text: "Hello, this is a test.",
        headers: expect.objectContaining({
          [LOOP_PREVENTION_HEADER]: "true",
        }),
      }),
    );
  });

  it("includes In-Reply-To header when provided", async () => {
    const transport = createMockTransport();

    await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "Re: Test",
      body: "Reply body",
      inReplyTo: "<parent-msg@example.com>",
    });

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "In-Reply-To": "<parent-msg@example.com>",
          [LOOP_PREVENTION_HEADER]: "true",
        }),
      }),
    );
  });

  it("includes References header when provided", async () => {
    const transport = createMockTransport();

    await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "Re: Test",
      body: "Reply body",
      references: "<msg1@example.com> <msg2@example.com>",
    });

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          References: "<msg1@example.com> <msg2@example.com>",
        }),
      }),
    );
  });

  it("includes CC when provided", async () => {
    const transport = createMockTransport();

    await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "Test",
      body: "Body",
      cc: ["cc1@example.com", "cc2@example.com"],
    });

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        cc: "cc1@example.com, cc2@example.com",
      }),
    );
  });

  it("omits CC when not provided", async () => {
    const transport = createMockTransport();

    await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "Test",
      body: "Body",
    });

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        cc: undefined,
      }),
    );
  });

  it("sends without threading headers when none provided", async () => {
    const transport = createMockTransport();

    await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "New email",
      body: "Body",
    });

    const call = (transport.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(call.headers).not.toHaveProperty("In-Reply-To");
    expect(call.headers).not.toHaveProperty("References");
  });

  it("always includes loop-prevention header even with threading", async () => {
    const transport = createMockTransport();

    await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "Re: Thread",
      body: "Reply",
      inReplyTo: "<parent@example.com>",
      references: "<first@example.com> <parent@example.com>",
    });

    const call = (transport.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(call.headers[LOOP_PREVENTION_HEADER]).toBe("true");
    expect(call.headers["In-Reply-To"]).toBe("<parent@example.com>");
    expect(call.headers["References"]).toBe(
      "<first@example.com> <parent@example.com>",
    );
  });

  it("propagates transport errors", async () => {
    const transport: SmtpTransport = {
      send: vi.fn().mockRejectedValue(new Error("Connection refused")),
    };

    await expect(
      sendPlainEmail(transport, "me@dcrm.com", {
        to: "client@example.com",
        subject: "Test",
        body: "Body",
      }),
    ).rejects.toThrow("Connection refused");
  });

  it("returns sentAt as a recent date", async () => {
    const transport = createMockTransport();
    const before = Date.now();

    const result = await sendPlainEmail(transport, "me@dcrm.com", {
      to: "client@example.com",
      subject: "Test",
      body: "Body",
    });

    const after = Date.now();
    expect(result.sentAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.sentAt.getTime()).toBeLessThanOrEqual(after);
  });
});
