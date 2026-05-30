/**
 * Unmatched email inbox handling.
 *
 * When an incoming email does not match any authorized sender pattern,
 * it is stored in the unmatched inbox. The user can later manually link
 * it to a client, which creates an exchange and emits the appropriate event.
 */

import type { ImapMessage } from "./imap-sync";

// ── Types ────────────────────────────────────────────────────────────────

/** Shape of an unmatched email record as stored in the database. */
export type UnmatchedEmailRecord = {
  readonly id: string;
  readonly userId: string;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly subject: string | null;
  readonly body: string | null;
  readonly headers: Readonly<Record<string, unknown>> | null;
  readonly receivedAt: Date;
  readonly linkedEntityType: string | null;
  readonly linkedEntityId: string | null;
  readonly createdAt: Date;
};

/** Exchange record returned after linking. */
export type LinkedExchange = {
  readonly id: string;
  readonly clientId: string;
};

/** Dependencies for linking an unmatched email to a client. */
export type LinkUnmatchedDeps = {
  /** Retrieve an unmatched email by ID. Returns null if not found. */
  readonly getUnmatchedEmail: (
    id: string,
  ) => Promise<UnmatchedEmailRecord | null>;
  /** Create an exchange from the unmatched email data. */
  readonly createExchange: (input: {
    readonly userId: string;
    readonly type: "email";
    readonly clientId: string;
    readonly projectId: string | null;
    readonly ticketId: string | null;
    readonly subject: string | null;
    readonly body: string | null;
    readonly direction: "incoming";
    readonly metadata: Readonly<Record<string, unknown>> | null;
    readonly isInternal: boolean;
  }) => Promise<LinkedExchange>;
  /** Emit an event through the event engine. */
  readonly emitEvent: (input: {
    readonly type: string;
    readonly userId: string;
    readonly source: "email";
    readonly entity?: { readonly type: string; readonly id: string };
    readonly payload: Readonly<Record<string, unknown>>;
  }) => Promise<void>;
  /** Mark the unmatched email as linked. Returns number of rows affected. */
  readonly markAsLinked: (
    id: string,
    entityType: string,
    entityId: string,
  ) => Promise<number>;
};

/** Result of a successful link operation. */
export type LinkResult = {
  readonly exchangeId: string;
  readonly clientId: string;
};

/** Result when the record was already linked by a concurrent request. */
export type AlreadyLinkedResult = {
  readonly alreadyLinked: true;
  readonly linkedEntityId: string;
};

/** Union result of a link attempt. */
export type LinkAttemptResult = LinkResult | AlreadyLinkedResult;

// ── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Builds the unmatched email storage payload from an ImapMessage.
 */
export function buildUnmatchedEmailData(
  message: ImapMessage,
  userId: string,
): {
  readonly userId: string;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly subject: string | null;
  readonly body: string | null;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly receivedAt: Date;
} {
  return {
    userId,
    fromAddress: message.from,
    toAddress: message.to[0] ?? "",
    subject: message.subject,
    body: message.textBody ?? message.htmlBody,
    headers: { ...message.headers },
    receivedAt: message.receivedAt,
  };
}

// ── Link operation ───────────────────────────────────────────────────────

/**
 * Links an unmatched email to a client by creating an exchange.
 *
 * Steps:
 * 1. Fetch the unmatched email record.
 * 2. Create an exchange linked to the specified client.
 * 3. Emit an exchange.created event.
 * 4. Mark the unmatched email as linked.
 *
 * Throws if the unmatched email is not found or already linked.
 */
export async function linkUnmatchedEmail(
  unmatchedEmailId: string,
  clientId: string,
  userId: string,
  deps: LinkUnmatchedDeps,
): Promise<LinkAttemptResult> {
  const record = await deps.getUnmatchedEmail(unmatchedEmailId);

  if (record === null) {
    throw new Error(`Unmatched email not found: ${unmatchedEmailId}`);
  }

  if (record.userId !== userId) {
    throw new Error("Unmatched email does not belong to user");
  }

  // Atomic conditional update: only mark as linked if not already linked.
  // This eliminates the TOCTOU race between the check and the update.
  const rowsAffected = await deps.markAsLinked(unmatchedEmailId, "client", clientId);

  if (rowsAffected === 0) {
    const fresh = await deps.getUnmatchedEmail(unmatchedEmailId);
    return {
      alreadyLinked: true,
      linkedEntityId: fresh?.linkedEntityId ?? clientId,
    };
  }

  const exchange = await deps.createExchange({
    userId,
    type: "email",
    clientId,
    projectId: null,
    ticketId: null,
    subject: record.subject,
    body: record.body,
    direction: "incoming",
    metadata: {
      from: record.fromAddress,
      to: record.toAddress,
      headers: record.headers,
      receivedAt: record.receivedAt.toISOString(),
      linkedFromUnmatched: true,
    },
    isInternal: false,
  });

  await deps.emitEvent({
    type: "exchange.created",
    userId,
    source: "email",
    entity: { type: "exchange", id: exchange.id },
    payload: {
      exchangeId: exchange.id,
      clientId,
      from: record.fromAddress,
      subject: record.subject,
      linkedFromUnmatched: true,
    },
  });

  return { exchangeId: exchange.id, clientId };
}
