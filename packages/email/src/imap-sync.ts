/**
 * IMAP sync worker and exchange creation for incoming email.
 *
 * Responsibilities:
 * - BullMQ queue/worker for scheduled email sync jobs
 * - Loop prevention via X-DCRM-Sent header detection
 * - Sender matching against authorized patterns
 * - Exchange creation for matched emails with event emission
 * - Sync state management (last UID, UID validity)
 * - Unmatched email storage for manual linking
 */

import { Queue, Worker } from "bullmq";

import {
  matchSender,
  type AuthorizedPattern,
  type MatchResult,
} from "./matching";

// ── Constants ────────────────────────────────────────────────────────────

/** Header name used to mark outgoing DCRM emails. */
export const LOOP_PREVENTION_HEADER = "x-dcrm-sent";

/** Value of the loop-prevention header on outgoing messages. */
const LOOP_PREVENTION_VALUE = "true";

/** Default IMAP folder to sync. */
export const DEFAULT_SYNC_FOLDER = "INBOX";

/** Default sync interval in minutes. */
export const DEFAULT_SYNC_INTERVAL_MINUTES = 15;

// ── Types ────────────────────────────────────────────────────────────────

/** A normalized IMAP message after parsing by the IMAP adapter. */
export type ImapMessage = {
  readonly uid: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string | null;
  readonly textBody: string | null;
  readonly htmlBody: string | null;
  /** Lowercased header names → string or string[] values. */
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  readonly receivedAt: Date;
  readonly inReplyTo: string | null;
  readonly references: string | null;
  readonly messageId: string | null;
};

/** Data payload for a sync job enqueued in BullMQ. */
export type SyncJobData = {
  readonly userId: string;
  readonly emailAccountId: string;
  readonly accountEmail: string;
  readonly folder: string;
};

/** Sync state tracked per account/folder. */
export type SyncState = {
  readonly id: string;
  readonly emailAccountId: string;
  readonly folder: string;
  readonly lastUid: string | null;
  readonly uidValidity: string | null;
  readonly lastSyncAt: Date;
};

/** An exchange record created from a matched email. */
export type ExchangeRecord = {
  readonly id: string;
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
};

/** Input shape for creating an exchange from a matched email. */
export type CreateExchangeInput = {
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
};

/** Simplified event emission input for the sync processor. */
export type SyncEventInput = {
  readonly type: string;
  readonly userId: string;
  readonly source: "email";
  readonly entity?: { readonly type: string; readonly id: string };
  readonly payload: Readonly<Record<string, unknown>>;
};

/** Simplified event record returned after emission. */
export type SyncEvent = {
  readonly id: string;
  readonly type: string;
  readonly userId: string;
  readonly createdAt: Date;
};

/** Data for storing an unmatched email. */
export type UnmatchedEmailInput = {
  readonly userId: string;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly subject: string | null;
  readonly body: string | null;
  readonly headers: Readonly<Record<string, unknown>> | null;
  readonly receivedAt: Date;
};

/** Aggregate result of processing a sync batch. */
export type SyncResult = {
  readonly processed: number;
  readonly matched: number;
  readonly unmatched: number;
  readonly skipped: number;
  readonly lastUid: string | null;
};

/** Injected dependencies for the sync processor. */
export type SyncProcessorDeps = {
  readonly fetchAuthorizedPatterns: (
    userId: string,
  ) => Promise<readonly AuthorizedPattern[]>;
  readonly createExchange: (
    input: CreateExchangeInput,
  ) => Promise<ExchangeRecord>;
  readonly emitEvent: (input: SyncEventInput) => Promise<SyncEvent>;
  readonly storeUnmatchedEmail: (
    input: UnmatchedEmailInput,
  ) => Promise<{ readonly id: string }>;
  readonly getSyncState: (
    emailAccountId: string,
    folder: string,
  ) => Promise<SyncState | null>;
  readonly updateSyncState: (
    emailAccountId: string,
    folder: string,
    lastUid: string,
  ) => Promise<void>;
  readonly updateLastSyncAt: (emailAccountId: string) => Promise<void>;
};

/** BullMQ sync queue adapter interface. */
export type SyncQueueAdapter = {
  readonly addSyncJob: (data: SyncJobData) => Promise<void>;
  readonly addRecurringSyncJob: (
    data: SyncJobData,
    intervalMinutes: number,
  ) => Promise<void>;
  readonly close: () => Promise<void>;
};

/** Redis connection config for BullMQ. */
export type RedisConnectionConfig = {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
};

/** Function that fetches IMAP messages for a sync run. */
export type FetchMessagesFn = (
  userId: string,
  emailAccountId: string,
  accountEmail: string,
  folder: string,
  syncState: SyncState | null,
) => Promise<readonly ImapMessage[]>;

// ── Pure functions ───────────────────────────────────────────────────────

/**
 * Checks whether a message carries the loop-prevention header.
 * Outgoing DCRM emails include `X-DCRM-Sent: true` so the sync
 * pipeline skips re-importing them.
 */
export function hasLoopPreventionHeader(message: ImapMessage): boolean {
  const value = message.headers[LOOP_PREVENTION_HEADER];
  if (value === undefined) return false;
  if (typeof value === "string") {
    return value.toLowerCase() === LOOP_PREVENTION_VALUE;
  }
  if (Array.isArray(value)) {
    return value.some((v) => v.toLowerCase() === LOOP_PREVENTION_VALUE);
  }
  return false;
}

/**
 * Builds the exchange creation input from a matched email and its match result.
 */
export function buildExchangeInput(
  message: ImapMessage,
  matchResult: MatchResult & { matched: true },
  userId: string,
): CreateExchangeInput {
  return {
    userId,
    type: "email",
    clientId: matchResult.clientId,
    projectId: null,
    ticketId: null,
    subject: message.subject,
    body: message.textBody ?? message.htmlBody,
    direction: "incoming",
    metadata: {
      from: message.from,
      to: [...message.to],
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      receivedAt: message.receivedAt.toISOString(),
      matchPattern: matchResult.pattern,
    },
    isInternal: false,
  };
}

/**
 * Processes a batch of IMAP messages through the sync pipeline.
 *
 * For each message:
 * 1. Skip if the loop-prevention header is present.
 * 2. Match sender against authorized patterns.
 * 3. Matched → create exchange + emit exchange.created event.
 * 4. Unmatched → store in unmatched inbox for manual linking.
 *
 * After the batch, updates sync state and emits an email.synced summary event.
 */
export async function processSyncMessages(
  messages: readonly ImapMessage[],
  deps: SyncProcessorDeps,
  userId: string,
  emailAccountId: string,
  folder: string,
): Promise<SyncResult> {
  if (messages.length === 0) {
    return { processed: 0, matched: 0, unmatched: 0, skipped: 0, lastUid: null };
  }

  const patterns = await deps.fetchAuthorizedPatterns(userId);

  let matched = 0;
  let unmatched = 0;
  let skipped = 0;
  let lastUid: string | null = null;

  for (const message of messages) {
    if (hasLoopPreventionHeader(message)) {
      skipped++;
      lastUid = message.uid;
      continue;
    }

    const matchResult = matchSender(message.from, patterns);

    if (matchResult.matched) {
      const exchangeInput = buildExchangeInput(message, matchResult, userId);
      const exchange = await deps.createExchange(exchangeInput);

      await deps.emitEvent({
        type: "exchange.created",
        userId,
        source: "email",
        entity: { type: "exchange", id: exchange.id },
        payload: {
          exchangeId: exchange.id,
          clientId: exchange.clientId,
          from: message.from,
          subject: message.subject,
          matchPattern: matchResult.pattern,
        },
      });

      matched++;
    } else {
      await deps.storeUnmatchedEmail({
        userId,
        fromAddress: message.from,
        toAddress: message.to[0] ?? "",
        subject: message.subject,
        body: message.textBody ?? message.htmlBody,
        headers: { ...message.headers },
        receivedAt: message.receivedAt,
      });

      unmatched++;
    }

    lastUid = message.uid;
  }

  if (lastUid !== null) {
    await deps.updateSyncState(emailAccountId, folder, lastUid);
    await deps.updateLastSyncAt(emailAccountId);
  }

  await deps.emitEvent({
    type: "email.synced",
    userId,
    source: "email",
    payload: {
      emailAccountId,
      folder,
      processed: messages.length,
      matched,
      unmatched,
      skipped,
    },
  });

  return { processed: messages.length, matched, unmatched, skipped, lastUid };
}

// ── BullMQ setup ─────────────────────────────────────────────────────────

const SYNC_QUEUE_NAME = "email-sync";
const SYNC_JOB_NAME = "sync-folder";
const SYNC_RECURRING_JOB_NAME = "sync-folder-recurring";

/**
 * Creates a BullMQ-backed sync queue adapter for enqueuing sync jobs.
 */
export function createSyncQueue(
  connection: RedisConnectionConfig,
): SyncQueueAdapter {
  const queue = new Queue(SYNC_QUEUE_NAME, { connection });

  return {
    async addSyncJob(data: SyncJobData) {
      await queue.add(SYNC_JOB_NAME, data, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
    },

    async addRecurringSyncJob(data: SyncJobData, intervalMinutes: number) {
      await queue.add(SYNC_RECURRING_JOB_NAME, data, {
        repeat: { every: intervalMinutes * 60_000 },
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
    },

    async close() {
      await queue.close();
    },
  };
}

/**
 * Creates a BullMQ worker that processes email sync jobs.
 *
 * The actual IMAP message fetching is delegated to `fetchMessages`.
 * Processing (matching, exchange creation, event emission) uses processSyncMessages.
 */
export function createSyncWorker(
  connection: RedisConnectionConfig,
  deps: SyncProcessorDeps,
  fetchMessages: FetchMessagesFn,
): Worker<SyncJobData, SyncResult> {
  return new Worker<SyncJobData, SyncResult>(
    SYNC_QUEUE_NAME,
    async (job) => {
      const { userId, emailAccountId, accountEmail, folder } = job.data;
      const syncState = await deps.getSyncState(emailAccountId, folder);
      const messages = await fetchMessages(
        userId,
        emailAccountId,
        accountEmail,
        folder,
        syncState,
      );
      return processSyncMessages(messages, deps, userId, emailAccountId, folder);
    },
    { connection },
  );
}
