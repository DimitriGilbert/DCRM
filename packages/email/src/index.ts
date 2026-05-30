export {
  matchSender,
  matchSenders,
  normalizeEmail,
  isWildcardPattern,
  extractWildcardDomain,
  extractDomain,
  isValidPattern,
  type AuthorizedPattern,
  type MatchResult,
} from "./matching";

export {
  createEmailCredentialConfig,
  type EmailCredentialConfig,
  type ImapCredentials,
  type SmtpCredentials,
  type EmailAccountCredentials,
  type EncryptedField,
  type EncryptedImapFields,
  type EncryptedSmtpFields,
  type EncryptedEmailAccountFields,
} from "./config";

export {
  LOOP_PREVENTION_HEADER,
  DEFAULT_SYNC_FOLDER,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  hasLoopPreventionHeader,
  buildExchangeInput,
  processSyncMessages,
  createSyncQueue,
  createSyncWorker,
  type ImapMessage,
  type SyncJobData,
  type SyncState,
  type ExchangeRecord,
  type CreateExchangeInput,
  type SyncEventInput,
  type SyncEvent,
  type UnmatchedEmailInput,
  type SyncResult,
  type SyncProcessorDeps,
  type SyncQueueAdapter,
  type RedisConnectionConfig,
  type FetchMessagesFn,
} from "./imap-sync";

export {
  buildUnmatchedEmailData,
  linkUnmatchedEmail,
  type UnmatchedEmailRecord,
  type LinkedExchange,
  type LinkUnmatchedDeps,
  type LinkResult,
  type AlreadyLinkedResult,
  type LinkAttemptResult,
} from "./unmatched";

export {
  sendPlainEmail,
  createNodemailerTransport,
  type SendEmailOptions,
  type SendEmailResult,
  type SmtpTransport,
} from "./smtp";

export {
  extractMessageId,
  buildThreadingHeaders,
  matchReplyToTicket,
  buildTicketSubject,
  type ThreadableExchange,
  type ThreadingHeaders,
} from "./threading";
