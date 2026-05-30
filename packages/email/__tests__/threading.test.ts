import { describe, it, expect } from "vitest";

import {
  extractMessageId,
  buildThreadingHeaders,
  matchReplyToTicket,
  buildTicketSubject,
  type ThreadableExchange,
} from "../src/threading";

// ── Fixtures ─────────────────────────────────────────────────────────────

function createExchange(
  overrides?: Partial<ThreadableExchange>,
): ThreadableExchange {
  return {
    id: "ex-001",
    ticketId: "ticket-1",
    metadata: null,
    createdAt: new Date("2024-06-15T10:00:00Z"),
    ...overrides,
  };
}

// ── extractMessageId ─────────────────────────────────────────────────────

describe("extractMessageId", () => {
  it("extracts messageId from metadata", () => {
    expect(extractMessageId({ messageId: "<msg1@example.com>" })).toBe(
      "<msg1@example.com>",
    );
  });

  it("returns null when metadata is null", () => {
    expect(extractMessageId(null)).toBeNull();
  });

  it("returns null when messageId is missing", () => {
    expect(extractMessageId({})).toBeNull();
  });

  it("returns null when messageId is empty string", () => {
    expect(extractMessageId({ messageId: "" })).toBeNull();
  });

  it("returns null when messageId is not a string", () => {
    expect(extractMessageId({ messageId: 123 })).toBeNull();
  });
});

// ── buildThreadingHeaders ────────────────────────────────────────────────

describe("buildThreadingHeaders", () => {
  it("returns nulls when no exchanges have messageId", () => {
    const exchanges = [
      createExchange({ id: "ex-1", metadata: null }),
      createExchange({ id: "ex-2", metadata: {} }),
    ];

    const result = buildThreadingHeaders(exchanges);
    expect(result.inReplyTo).toBeNull();
    expect(result.references).toBeNull();
  });

  it("returns nulls for empty exchange list", () => {
    const result = buildThreadingHeaders([]);
    expect(result.inReplyTo).toBeNull();
    expect(result.references).toBeNull();
  });

  it("sets In-Reply-To to the single messageId", () => {
    const exchanges = [
      createExchange({
        metadata: { messageId: "<msg1@example.com>" },
        createdAt: new Date("2024-06-15T10:00:00Z"),
      }),
    ];

    const result = buildThreadingHeaders(exchanges);
    expect(result.inReplyTo).toBe("<msg1@example.com>");
    expect(result.references).toBe("<msg1@example.com>");
  });

  it("sets In-Reply-To to the latest messageId by date", () => {
    const exchanges = [
      createExchange({
        id: "ex-old",
        metadata: { messageId: "<old@example.com>" },
        createdAt: new Date("2024-06-10T10:00:00Z"),
      }),
      createExchange({
        id: "ex-new",
        metadata: { messageId: "<new@example.com>" },
        createdAt: new Date("2024-06-15T10:00:00Z"),
      }),
    ];

    const result = buildThreadingHeaders(exchanges);
    expect(result.inReplyTo).toBe("<new@example.com>");
    expect(result.references).toBe("<old@example.com> <new@example.com>");
  });

  it("skips exchanges without messageId in the chain", () => {
    const exchanges = [
      createExchange({
        id: "ex-1",
        metadata: { messageId: "<first@example.com>" },
        createdAt: new Date("2024-06-10T10:00:00Z"),
      }),
      createExchange({
        id: "ex-2",
        metadata: null,
        createdAt: new Date("2024-06-12T10:00:00Z"),
      }),
      createExchange({
        id: "ex-3",
        metadata: { messageId: "<third@example.com>" },
        createdAt: new Date("2024-06-15T10:00:00Z"),
      }),
    ];

    const result = buildThreadingHeaders(exchanges);
    expect(result.inReplyTo).toBe("<third@example.com>");
    expect(result.references).toBe(
      "<first@example.com> <third@example.com>",
    );
  });

  it("handles exchanges provided out of order", () => {
    const exchanges = [
      createExchange({
        id: "ex-new",
        metadata: { messageId: "<new@example.com>" },
        createdAt: new Date("2024-06-15T10:00:00Z"),
      }),
      createExchange({
        id: "ex-old",
        metadata: { messageId: "<old@example.com>" },
        createdAt: new Date("2024-06-10T10:00:00Z"),
      }),
    ];

    const result = buildThreadingHeaders(exchanges);
    expect(result.inReplyTo).toBe("<new@example.com>");
    expect(result.references).toBe("<old@example.com> <new@example.com>");
  });
});

// ── matchReplyToTicket ───────────────────────────────────────────────────

describe("matchReplyToTicket", () => {
  const exchanges: readonly ThreadableExchange[] = [
    createExchange({
      id: "ex-1",
      ticketId: "ticket-1",
      metadata: { messageId: "<msg-1@example.com>" },
      createdAt: new Date("2024-06-10T10:00:00Z"),
    }),
    createExchange({
      id: "ex-2",
      ticketId: "ticket-2",
      metadata: { messageId: "<msg-2@example.com>" },
      createdAt: new Date("2024-06-15T10:00:00Z"),
    }),
    createExchange({
      id: "ex-3",
      ticketId: null,
      metadata: { messageId: "<msg-3@example.com>" },
      createdAt: new Date("2024-06-20T10:00:00Z"),
    }),
  ];

  it("matches ticket by In-Reply-To", () => {
    const ticketId = matchReplyToTicket(
      "<msg-1@example.com>",
      null,
      exchanges,
    );
    expect(ticketId).toBe("ticket-1");
  });

  it("matches ticket by References", () => {
    const ticketId = matchReplyToTicket(
      null,
      "<msg-2@example.com>",
      exchanges,
    );
    expect(ticketId).toBe("ticket-2");
  });

  it("prefers In-Reply-To over References", () => {
    const ticketId = matchReplyToTicket(
      "<msg-1@example.com>",
      "<msg-2@example.com>",
      exchanges,
    );
    expect(ticketId).toBe("ticket-1");
  });

  it("returns null when no match", () => {
    const ticketId = matchReplyToTicket(
      "<unknown@example.com>",
      null,
      exchanges,
    );
    expect(ticketId).toBeNull();
  });

  it("returns null for null headers", () => {
    const ticketId = matchReplyToTicket(null, null, exchanges);
    expect(ticketId).toBeNull();
  });

  it("returns null when matching exchange has no ticketId", () => {
    const ticketId = matchReplyToTicket(
      "<msg-3@example.com>",
      null,
      exchanges,
    );
    expect(ticketId).toBeNull();
  });

  it("matches from References with multiple IDs", () => {
    const ticketId = matchReplyToTicket(
      null,
      "<other@example.com> <msg-2@example.com> <another@example.com>",
      exchanges,
    );
    expect(ticketId).toBe("ticket-2");
  });

  it("returns null for empty exchange list", () => {
    const ticketId = matchReplyToTicket(
      "<msg-1@example.com>",
      null,
      [],
    );
    expect(ticketId).toBeNull();
  });

  it("returns null for empty string headers", () => {
    const ticketId = matchReplyToTicket("", "", exchanges);
    expect(ticketId).toBeNull();
  });
});

// ── buildTicketSubject ───────────────────────────────────────────────────

describe("buildTicketSubject", () => {
  it("returns plain title for first email", () => {
    expect(buildTicketSubject("Fix the bug", false)).toBe("Fix the bug");
  });

  it("adds Re: prefix for replies", () => {
    expect(buildTicketSubject("Fix the bug", true)).toBe("Re: Fix the bug");
  });

  it("does not double Re: prefix", () => {
    expect(buildTicketSubject("Re: Fix the bug", true)).toBe(
      "Re: Fix the bug",
    );
  });
});
