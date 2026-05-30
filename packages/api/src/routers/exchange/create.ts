import { db } from "@DCRM/db";
import { clients, exchanges, projects, tickets } from "@DCRM/db/schema/crm";
import type { ExchangeType } from "@DCRM/domain";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createExchangeSchema } from "./schemas";

async function createExchangeInDb(
  userId: string,
  input: {
    type: ExchangeType;
    clientId?: string;
    projectId?: string;
    ticketId?: string;
    subject?: string;
    body?: string;
    direction: string;
    metadata?: Record<string, unknown>;
    isInternal?: boolean;
  },
) {
  const id = nanoid();
  const now = new Date();

  const row = {
    id,
    userId,
    type: input.type as ExchangeType,
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    ticketId: input.ticketId ?? null,
    subject: input.subject ?? null,
    body: input.body ?? null,
    direction: input.direction as "incoming" | "outgoing",
    metadata: input.metadata ?? null,
    isInternal: input.isInternal ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(exchanges).values(row);

  return row;
}

export const createExchange = protectedProcedure
  .input(createExchangeSchema)
  .mutation(async ({ ctx, input }) => {
    // Verify ownership of referenced entities
    if (input.ticketId) {
      const [ticket] = await db
        .select({ id: tickets.id, userId: tickets.userId })
        .from(tickets)
        .where(
          and(
            eq(tickets.id, input.ticketId),
            eq(tickets.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!ticket) {
        return null;
      }
    }

    if (input.projectId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!project) {
        return null;
      }
    }

    if (input.clientId) {
      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.id, input.clientId),
            eq(clients.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!client) {
        return null;
      }
    }

    const row = await createExchangeInDb(ctx.user.id, input);

    // Emit ticket.comment_added for comment exchanges on tickets
    if (input.type === "comment" && input.ticketId) {
      await emitEvent(
        { insert: async () => {} },
        {
          type: EVENT_TYPE.TICKET_COMMENT_ADDED,
          userId: ctx.user.id,
          source: "app",
          entity: { type: "ticket", id: input.ticketId },
          payload: {
            exchangeId: row.id,
            body: input.body ?? null,
          },
        },
      );
    }

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.EXCHANGE_CREATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "exchange", id: row.id },
        payload: {
          type: row.type,
          clientId: row.clientId,
          projectId: row.projectId,
          ticketId: row.ticketId,
          direction: row.direction,
          isInternal: row.isInternal,
        },
      },
    );

    return row;
  });

export { createExchangeInDb };
