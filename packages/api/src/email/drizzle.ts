import { createDb } from "@DCRM/db";
import { emailSyncStates, unmatchedEmailMessages } from "@DCRM/db/schema/automation-integrations";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { EmailSyncRepository, EmailSyncStateRecord, UnmatchedEmailRecord } from "./sync.js";

type EmailSyncDatabase = ReturnType<typeof createDb>;

export function createDrizzleEmailSyncRepository(database: EmailSyncDatabase = createDb()): EmailSyncRepository {
  return {
    async getState(input) {
      const rows = await database.select().from(emailSyncStates).where(and(eq(emailSyncStates.userId, input.userId), eq(emailSyncStates.emailAccountId, input.emailAccountId), eq(emailSyncStates.mailbox, input.mailbox))).limit(1);
      return rows[0] ? rowToSyncState(rows[0]) : null;
    },
    async markRunning(input) {
      return upsertState(database, input, { status: "running", error: null, lastSyncedAt: undefined, lastUid: undefined, syncCursor: undefined });
    },
    async markSucceeded(input) {
      return upsertState(database, input, { status: "idle", error: null, lastSyncedAt: input.now, lastUid: input.lastUid, syncCursor: input.syncCursor });
    },
    async markFailed(input) {
      return upsertState(database, input, { status: "failed", error: input.error, lastSyncedAt: undefined, lastUid: undefined, syncCursor: undefined });
    },
    async storeUnmatched(input) {
      const rows = await database
        .insert(unmatchedEmailMessages)
        .values({
          id: input.id,
          userId: input.userId,
          emailAccountId: input.emailAccountId,
          mailbox: input.mailbox,
          uid: input.uid,
          messageId: input.messageId,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          subject: input.subject,
          bodyPreview: input.bodyPreview,
          receivedAt: input.receivedAt,
          metadata: input.metadata,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({ target: [unmatchedEmailMessages.emailAccountId, unmatchedEmailMessages.messageId], set: { uid: input.uid, mailbox: input.mailbox, fromEmail: input.fromEmail, fromName: input.fromName, subject: input.subject, bodyPreview: input.bodyPreview, receivedAt: input.receivedAt, metadata: input.metadata, updatedAt: input.now } })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error("Unmatched email was not saved.");
      }
      return rowToUnmatchedEmail(row);
    },
    async listUnmatched(input) {
      const rows = await database.select().from(unmatchedEmailMessages).where(and(eq(unmatchedEmailMessages.userId, input.userId), isNull(unmatchedEmailMessages.linkedExchangeId), isNull(unmatchedEmailMessages.deletedAt))).orderBy(desc(unmatchedEmailMessages.receivedAt));
      return rows.map(rowToUnmatchedEmail);
    },
  };
}

async function upsertState(database: EmailSyncDatabase, input: { readonly userId: string; readonly emailAccountId: string; readonly mailbox: string; readonly now: Date }, patch: { readonly status: EmailSyncStateRecord["status"]; readonly error: Record<string, unknown> | null; readonly lastSyncedAt: Date | undefined; readonly lastUid: string | null | undefined; readonly syncCursor: string | null | undefined }): Promise<EmailSyncStateRecord> {
  const values = { id: crypto.randomUUID(), userId: input.userId, emailAccountId: input.emailAccountId, mailbox: input.mailbox, status: patch.status, error: patch.error, ...(patch.lastSyncedAt !== undefined ? { lastSyncedAt: patch.lastSyncedAt } : {}), ...(patch.lastUid !== undefined ? { lastUid: patch.lastUid } : {}), ...(patch.syncCursor !== undefined ? { syncCursor: patch.syncCursor } : {}), createdAt: input.now, updatedAt: input.now };
  const set = { status: patch.status, error: patch.error, ...(patch.lastSyncedAt !== undefined ? { lastSyncedAt: patch.lastSyncedAt } : {}), ...(patch.lastUid !== undefined ? { lastUid: patch.lastUid } : {}), ...(patch.syncCursor !== undefined ? { syncCursor: patch.syncCursor } : {}), updatedAt: input.now };
  const rows = await database.insert(emailSyncStates).values(values).onConflictDoUpdate({ target: [emailSyncStates.emailAccountId, emailSyncStates.mailbox], set }).returning();
  const row = rows[0];
  if (!row) {
    throw new Error("Email sync state was not saved.");
  }
  return rowToSyncState(row);
}

function rowToSyncState(row: typeof emailSyncStates.$inferSelect): EmailSyncStateRecord {
  return { id: row.id, userId: row.userId, emailAccountId: row.emailAccountId, mailbox: row.mailbox, lastUid: row.lastUid, syncCursor: row.syncCursor, lastSyncedAt: row.lastSyncedAt, status: requireSyncStatus(row.status), error: row.error, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function rowToUnmatchedEmail(row: typeof unmatchedEmailMessages.$inferSelect): UnmatchedEmailRecord {
  return { id: row.id, userId: row.userId, emailAccountId: row.emailAccountId, mailbox: row.mailbox, uid: row.uid, messageId: row.messageId, fromEmail: row.fromEmail, fromName: row.fromName, subject: row.subject, bodyPreview: row.bodyPreview, receivedAt: row.receivedAt, metadata: row.metadata, createdAt: row.createdAt };
}

function requireSyncStatus(value: string): EmailSyncStateRecord["status"] {
  if (value === "idle" || value === "running" || value === "failed") {
    return value;
  }
  throw new Error(`Unsupported email sync status: ${value}`);
}
