import { db } from "@DCRM/db";
import { incomingWebhooks, events } from "@DCRM/db/schema/automation";
import { eq } from "drizzle-orm";
import { handleIncomingWebhook, type IncomingWebhookRecord } from "@DCRM/webhooks";
import type { MappingConfig } from "@DCRM/webhooks";
import type { EventPersister } from "@DCRM/events";

export type WebhookReceiverResult = {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;
};

async function findByToken(token: string): Promise<IncomingWebhookRecord | null> {
  const [row] = await db
    .select({
      id: incomingWebhooks.id,
      userId: incomingWebhooks.userId,
      name: incomingWebhooks.name,
      urlToken: incomingWebhooks.urlToken,
      secret: incomingWebhooks.secret,
      mode: incomingWebhooks.mode,
      mappingConfig: incomingWebhooks.mappingConfig,
      enabled: incomingWebhooks.enabled,
      lastReceivedAt: incomingWebhooks.lastReceivedAt,
    })
    .from(incomingWebhooks)
    .where(eq(incomingWebhooks.urlToken, token));

  if (!row) return null;

  return {
    ...row,
    mappingConfig: row.mappingConfig as MappingConfig | null,
    mode: row.mode as "test" | "live",
  };
}

async function updateLastReceived(id: string): Promise<void> {
  await db
    .update(incomingWebhooks)
    .set({ lastReceivedAt: new Date() })
    .where(eq(incomingWebhooks.id, id));
}

const persister: EventPersister = {
  async insert(row) {
    await db.insert(events).values({
      id: row.id,
      userId: row.userId,
      type: row.type,
      source: row.source,
      entityType: row.entityType,
      entityId: row.entityId,
      payload: row.payload,
      changes: row.changes ?? null,
      createdAt: new Date(),
    });
  },
};

/**
 * Processes an incoming webhook HTTP request.
 * This is the raw HTTP handler (not tRPC) for the webhook receiver endpoint.
 *
 * @param urlToken - The unique token from the webhook URL path
 * @param rawBody - The raw request body as a string
 * @param signatureHeader - The X-DCRM-Signature header value (or null)
 */
export async function receiveIncomingWebhook(
  urlToken: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<WebhookReceiverResult> {
  const result = await handleIncomingWebhook(urlToken, rawBody, signatureHeader, {
    findByToken,
    updateLastReceived,
    persister,
  });

  return {
    statusCode: result.statusCode,
    body: result.body,
  };
}
