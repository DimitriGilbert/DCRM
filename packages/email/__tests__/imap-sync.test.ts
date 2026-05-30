import { describe, it, expect, vi } from "vitest";

import {
  hasLoopPreventionHeader,
  buildExchangeInput,
  processSyncMessages,
  type ImapMessage,
  type SyncProcessorDeps,
  type ExchangeRecord,
  type SyncEvent,
} from "../src/imap-sync";

import {
  buildUnmatchedEmailData,
  linkUnmatchedEmail,
  type LinkUnmatchedDeps,
  type UnmatchedEmailRecord,
} from "../src/unmatched";

import type { AuthorizedPattern } from "../src/matching";

// ── Fixtures ─────────────────────────────────────────────────────────────

function createSampleMessage(
  overrides?: Partial<ImapMessage>,
): ImapMessage {
  return {
    uid: "100",
    from: "alice@example.com",
    to: ["me@dcrm.com"],
    subject: "Test Subject",
    textBody: "Hello world",
    htmlBody: "<p>Hello world</p>",
    headers: {},
    receivedAt: new Date("2024-06-15T10:00:00Z"),
    inReplyTo: null,
    references: null,
    messageId: "<msg100@example.com>",
    ...overrides,
  };
}

const PATTERNS: readonly AuthorizedPattern[] = [
  { pattern: "alice@example.com", clientId: "client-alice", clientName: "Alice" },
  { pattern: "*@widget.co", clientId: "client-widget", clientName: "Widget" },
];

function createMockExchange(overrides?: Partial<ExchangeRecord>): ExchangeRecord {
  return {
    id: "ex-001",
    userId: "user-1",
    type: "email",
    clientId: "client-alice",
    projectId: null,
    ticketId: null,
    subject: "Test Subject",
    body: "Hello world",
    direction: "incoming",
    metadata: null,
    isInternal: false,
    ...overrides,
  };
}

function createMockEvent(): SyncEvent {
  return { id: "evt-001", type: "exchange.created", userId: "user-1", createdAt: new Date() };
}

function createMockDeps(
  overrides?: Partial<SyncProcessorDeps>,
): SyncProcessorDeps {
  return {
    fetchAuthorizedPatterns: vi.fn().mockResolvedValue([...PATTERNS]),
    createExchange: vi.fn().mockResolvedValue(createMockExchange()),
    emitEvent: vi.fn().mockResolvedValue(createMockEvent()),
    storeUnmatchedEmail: vi.fn().mockResolvedValue({ id: "um-001" }),
    getSyncState: vi.fn().mockResolvedValue(null),
    updateSyncState: vi.fn().mockResolvedValue(undefined),
    updateLastSyncAt: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── hasLoopPreventionHeader ──────────────────────────────────────────────

describe("hasLoopPreventionHeader", () => {
  it("returns true when header is string 'true'", () => {
    const msg = createSampleMessage({
      headers: { "x-dcrm-sent": "true" },
    });
    expect(hasLoopPreventionHeader(msg)).toBe(true);
  });

  it("returns true when header is string 'True' (case-insensitive)", () => {
    const msg = createSampleMessage({
      headers: { "x-dcrm-sent": "True" },
    });
    expect(hasLoopPreventionHeader(msg)).toBe(true);
  });

  it("returns true when header is an array containing 'true'", () => {
    const msg = createSampleMessage({
      headers: { "x-dcrm-sent": ["true"] },
    });
    expect(hasLoopPreventionHeader(msg)).toBe(true);
  });

  it("returns false when header is absent", () => {
    const msg = createSampleMessage({ headers: {} });
    expect(hasLoopPreventionHeader(msg)).toBe(false);
  });

  it("returns false when header has unrelated value", () => {
    const msg = createSampleMessage({
      headers: { "x-dcrm-sent": "false" },
    });
    expect(hasLoopPreventionHeader(msg)).toBe(false);
  });
});

// ── buildExchangeInput ───────────────────────────────────────────────────

describe("buildExchangeInput", () => {
  it("builds correct exchange input from matched email", () => {
    const message = createSampleMessage();
    const matchResult = {
      matched: true as const,
      clientId: "client-alice",
      clientName: "Alice",
      pattern: "alice@example.com",
    };

    const input = buildExchangeInput(message, matchResult, "user-1");

    expect(input.userId).toBe("user-1");
    expect(input.type).toBe("email");
    expect(input.clientId).toBe("client-alice");
    expect(input.subject).toBe("Test Subject");
    expect(input.body).toBe("Hello world");
    expect(input.direction).toBe("incoming");
    expect(input.isInternal).toBe(false);
    expect(input.metadata).toMatchObject({
      from: "alice@example.com",
      to: ["me@dcrm.com"],
      messageId: "<msg100@example.com>",
      matchPattern: "alice@example.com",
    });
  });

  it("falls back to htmlBody when textBody is null", () => {
    const message = createSampleMessage({ textBody: null });
    const matchResult = {
      matched: true as const,
      clientId: "client-alice",
      pattern: "alice@example.com",
    };

    const input = buildExchangeInput(message, matchResult, "user-1");
    expect(input.body).toBe("<p>Hello world</p>");
  });
});

// ── processSyncMessages ──────────────────────────────────────────────────

describe("processSyncMessages", () => {
  it("returns zeros for empty message batch", async () => {
    const deps = createMockDeps();
    const result = await processSyncMessages([], deps, "user-1", "acc-1", "INBOX");

    expect(result).toEqual({
      processed: 0,
      matched: 0,
      unmatched: 0,
      skipped: 0,
      lastUid: null,
    });

    expect(deps.updateSyncState).not.toHaveBeenCalled();
    expect(deps.emitEvent).not.toHaveBeenCalled();
  });

  it("creates exchange for matched sender", async () => {
    const deps = createMockDeps();
    const messages = [createSampleMessage()];

    const result = await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.lastUid).toBe("100");

    expect(deps.createExchange).toHaveBeenCalledTimes(1);
    expect(deps.createExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "email",
        clientId: "client-alice",
      }),
    );

    // exchange.created + email.synced = 2 events
    expect(deps.emitEvent).toHaveBeenCalledTimes(2);
  });

  it("stores unmatched email for unknown sender", async () => {
    const deps = createMockDeps();
    const messages = [
      createSampleMessage({ from: "unknown@stranger.org", uid: "200" }),
    ];

    const result = await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(1);
    expect(result.lastUid).toBe("200");

    expect(deps.storeUnmatchedEmail).toHaveBeenCalledTimes(1);
    expect(deps.storeUnmatchedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        fromAddress: "unknown@stranger.org",
        subject: "Test Subject",
      }),
    );

    // Only email.synced event (no exchange.created)
    expect(deps.emitEvent).toHaveBeenCalledTimes(1);
  });

  it("skips messages with loop-prevention header", async () => {
    const deps = createMockDeps();
    const messages = [
      createSampleMessage({
        uid: "300",
        headers: { "x-dcrm-sent": "true" },
      }),
    ];

    const result = await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    expect(result.skipped).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(0);
    expect(result.lastUid).toBe("300");

    expect(deps.createExchange).not.toHaveBeenCalled();
    expect(deps.storeUnmatchedEmail).not.toHaveBeenCalled();
  });

  it("handles mixed batch of matched, unmatched, and skipped", async () => {
    const deps = createMockDeps();
    const messages = [
      createSampleMessage({ uid: "1", from: "alice@example.com" }),
      createSampleMessage({ uid: "2", from: "unknown@other.com" }),
      createSampleMessage({
        uid: "3",
        from: "alice@example.com",
        headers: { "x-dcrm-sent": "true" },
      }),
      createSampleMessage({ uid: "4", from: "dev@widget.co" }),
    ];

    const result = await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    expect(result.processed).toBe(4);
    expect(result.matched).toBe(2); // uid 1 and uid 4
    expect(result.unmatched).toBe(1); // uid 2
    expect(result.skipped).toBe(1); // uid 3
    expect(result.lastUid).toBe("4");

    expect(deps.createExchange).toHaveBeenCalledTimes(2);
    expect(deps.storeUnmatchedEmail).toHaveBeenCalledTimes(1);
  });

  it("updates sync state with last UID after processing", async () => {
    const deps = createMockDeps();
    const messages = [
      createSampleMessage({ uid: "501" }),
      createSampleMessage({ uid: "502" }),
    ];

    await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    expect(deps.updateSyncState).toHaveBeenCalledWith("acc-1", "INBOX", "502");
    expect(deps.updateLastSyncAt).toHaveBeenCalledWith("acc-1");
  });

  it("updates lastUid to skipped message uid when all skipped", async () => {
    const deps = createMockDeps();
    const messages = [
      createSampleMessage({ uid: "600", headers: { "x-dcrm-sent": "true" } }),
    ];

    const result = await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    expect(result.lastUid).toBe("600");
    expect(deps.updateSyncState).toHaveBeenCalledWith("acc-1", "INBOX", "600");
  });

  it("emits email.synced summary event", async () => {
    const deps = createMockDeps();
    const messages = [createSampleMessage()];

    await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    const syncedCall = (deps.emitEvent as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: readonly unknown[]) => (call[0] as { type: string }).type === "email.synced",
    );

    expect(syncedCall).toBeDefined();
    const payload = (syncedCall![0] as { payload: Record<string, unknown> }).payload;
    expect(payload).toMatchObject({
      emailAccountId: "acc-1",
      folder: "INBOX",
      processed: 1,
      matched: 1,
      unmatched: 0,
      skipped: 0,
    });
  });

  it("matches wildcard domain patterns", async () => {
    const deps = createMockDeps();
    const messages = [
      createSampleMessage({ uid: "10", from: "anyone@widget.co" }),
    ];

    const result = await processSyncMessages(messages, deps, "user-1", "acc-1", "INBOX");

    expect(result.matched).toBe(1);
    expect(deps.createExchange).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-widget" }),
    );
  });
});

// ── buildUnmatchedEmailData ──────────────────────────────────────────────

describe("buildUnmatchedEmailData", () => {
  it("builds data from ImapMessage", () => {
    const message = createSampleMessage();
    const data = buildUnmatchedEmailData(message, "user-1");

    expect(data.userId).toBe("user-1");
    expect(data.fromAddress).toBe("alice@example.com");
    expect(data.toAddress).toBe("me@dcrm.com");
    expect(data.subject).toBe("Test Subject");
    expect(data.body).toBe("Hello world");
    expect(data.receivedAt).toEqual(message.receivedAt);
  });

  it("uses first to-address and falls back to empty string", () => {
    const message = createSampleMessage({ to: [] });
    const data = buildUnmatchedEmailData(message, "user-1");
    expect(data.toAddress).toBe("");
  });
});

// ── linkUnmatchedEmail ───────────────────────────────────────────────────

function createMockUnmatchedRecord(
  overrides?: Partial<UnmatchedEmailRecord>,
): UnmatchedEmailRecord {
  return {
    id: "um-001",
    userId: "user-1",
    fromAddress: "unknown@stranger.org",
    toAddress: "me@dcrm.com",
    subject: "Hello",
    body: "Body text",
    headers: null,
    receivedAt: new Date("2024-06-15T10:00:00Z"),
    linkedEntityType: null,
    linkedEntityId: null,
    createdAt: new Date("2024-06-15T10:00:00Z"),
    ...overrides,
  };
}

function createMockLinkDeps(
  overrides?: Partial<LinkUnmatchedDeps>,
): LinkUnmatchedDeps {
  return {
    getUnmatchedEmail: vi.fn().mockResolvedValue(createMockUnmatchedRecord()),
    createExchange: vi.fn().mockResolvedValue({
      id: "ex-new",
      clientId: "client-1",
    }),
    emitEvent: vi.fn().mockResolvedValue(undefined),
    markAsLinked: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("linkUnmatchedEmail", () => {
  it("creates exchange and marks email as linked", async () => {
    const deps = createMockLinkDeps();

    const result = await linkUnmatchedEmail("um-001", "client-1", "user-1", deps);

    expect(result.exchangeId).toBe("ex-new");
    expect(result.clientId).toBe("client-1");

    expect(deps.createExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "email",
        clientId: "client-1",
        subject: "Hello",
        direction: "incoming",
      }),
    );

    expect(deps.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "exchange.created",
        userId: "user-1",
        source: "email",
      }),
    );

    expect(deps.markAsLinked).toHaveBeenCalledWith("um-001", "client", "client-1");
  });

  it("throws when unmatched email not found", async () => {
    const deps = createMockLinkDeps({
      getUnmatchedEmail: vi.fn().mockResolvedValue(null),
    });

    await expect(
      linkUnmatchedEmail("um-missing", "client-1", "user-1", deps),
    ).rejects.toThrow("Unmatched email not found");
  });

  it("throws when already linked", async () => {
    const deps = createMockLinkDeps({
      getUnmatchedEmail: vi.fn().mockResolvedValue(
        createMockUnmatchedRecord({
          linkedEntityType: "client",
          linkedEntityId: "client-old",
        }),
      ),
    });

    await expect(
      linkUnmatchedEmail("um-001", "client-1", "user-1", deps),
    ).rejects.toThrow("already linked");
  });

  it("throws when userId does not match", async () => {
    const deps = createMockLinkDeps();

    await expect(
      linkUnmatchedEmail("um-001", "client-1", "other-user", deps),
    ).rejects.toThrow("does not belong to user");
  });

  it("includes linkedFromUnmatched in exchange metadata", async () => {
    const deps = createMockLinkDeps();

    await linkUnmatchedEmail("um-001", "client-1", "user-1", deps);

    const exchangeCall = (deps.createExchange as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { metadata: Record<string, unknown> };
    expect(exchangeCall.metadata?.linkedFromUnmatched).toBe(true);
  });
});
