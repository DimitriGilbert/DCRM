import { db } from "@DCRM/db";
import { projects, tickets } from "@DCRM/db/schema/crm";
import type { TicketType, TicketStatus, TicketPriority } from "@DCRM/domain";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createTicketSchema } from "./schemas";

async function createTicketInDb(
  userId: string,
  input: {
    projectId: string;
    title: string;
    description?: string;
    type?: TicketType;
    status?: TicketStatus;
    priority?: TicketPriority;
    dueDate?: string;
  },
) {
  const id = nanoid();
  const now = new Date();

  const row = {
    id,
    userId,
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? null,
    type: (input.type ?? "task") as TicketType,
    status: (input.status ?? "open") as TicketStatus,
    priority: (input.priority ?? "medium") as TicketPriority,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.insert(tickets).values(row);

  return row;
}

export const createTicket = protectedProcedure
  .input(createTicketSchema)
  .mutation(async ({ ctx, input }) => {
    // Verify project ownership
    const [project] = await db
      .select({ id: projects.id, userId: projects.userId })
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

    const row = await createTicketInDb(ctx.user.id, input);

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.TICKET_CREATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "ticket", id: row.id },
        payload: {
          title: row.title,
          projectId: row.projectId,
          type: row.type,
          status: row.status,
          priority: row.priority,
        },
      },
    );

    return row;
  });

export { createTicketInDb };
