/**
 * Email threading logic using In-Reply-To and References headers.
 *
 * Provides pure functions for:
 * - Building threading headers for outgoing emails
 * - Matching incoming replies to existing tickets
 */

// ── Types ────────────────────────────────────────────────────────────────

/** Minimal exchange shape needed for threading. */
export type ThreadableExchange = {
  readonly id: string;
  readonly ticketId: string | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
};

/** Threading headers to include in an outgoing email. */
export type ThreadingHeaders = {
  /** The Message-Id this email replies to. */
  readonly inReplyTo: string | null;
  /** Space-separated chain of ancestor Message-Ids. */
  readonly references: string | null;
};

// ── Constants ────────────────────────────────────────────────────────────

const METADATA_MESSAGE_ID_KEY = "messageId";

// ── Pure functions ───────────────────────────────────────────────────────

/**
 * Extracts the email Message-Id from exchange metadata.
 */
export function extractMessageId(
  metadata: Record<string, unknown> | null,
): string | null {
  if (metadata === null) return null;
  const value = metadata[METADATA_MESSAGE_ID_KEY];
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

/**
 * Builds threading headers for an outgoing email reply.
 *
 * Given previous exchanges on the same thread, determines the correct
 * In-Reply-To and References headers. The most recent exchange with a
 * messageId becomes the direct parent (In-Reply-To), and all messageIds
 * form the References chain.
 */
export function buildThreadingHeaders(
  previousExchanges: readonly ThreadableExchange[],
): ThreadingHeaders {
  const sorted = [...previousExchanges].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const messageIds: string[] = [];
  for (const exchange of sorted) {
    const messageId = extractMessageId(exchange.metadata);
    if (messageId !== null) {
      messageIds.push(messageId);
    }
  }

  if (messageIds.length === 0) {
    return { inReplyTo: null, references: null };
  }

  const inReplyTo = messageIds[messageIds.length - 1]!;
  const references = messageIds.join(" ");

  return { inReplyTo, references };
}

/**
 * Matches an incoming email reply to a ticket ID.
 *
 * Searches through exchanges to find one whose messageId matches
 * the In-Reply-To header or appears in the References header.
 * Returns the ticketId of the first matching exchange with a ticket.
 */
export function matchReplyToTicket(
  inReplyTo: string | null,
  references: string | null,
  exchanges: readonly ThreadableExchange[],
): string | null {
  const candidateIds: string[] = [];

  if (inReplyTo !== null && inReplyTo.length > 0) {
    candidateIds.push(inReplyTo);
  }

  if (references !== null && references.length > 0) {
    const refIds = references.split(/\s+/).filter((id) => id.length > 0);
    candidateIds.push(...refIds);
  }

  if (candidateIds.length === 0) return null;

  const candidateSet = new Set(candidateIds);

  for (const exchange of exchanges) {
    const messageId = extractMessageId(exchange.metadata);
    if (
      messageId !== null &&
      candidateSet.has(messageId) &&
      exchange.ticketId !== null
    ) {
      return exchange.ticketId;
    }
  }

  return null;
}

/**
 * Builds a ticket email subject line.
 * Adds "Re: " prefix for replies, avoids stacking.
 */
export function buildTicketSubject(
  ticketTitle: string,
  isReply: boolean,
): string {
  if (!isReply) {
    return ticketTitle;
  }

  if (ticketTitle.startsWith("Re: ")) {
    return ticketTitle;
  }

  return `Re: ${ticketTitle}`;
}
