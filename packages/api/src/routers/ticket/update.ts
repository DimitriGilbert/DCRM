import { db } from "@DCRM/db";
import { projects, tickets } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateTicketSchema } from "./schemas";

export const updateTicket = protectedProcedure
  .input(updateTicketSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;

    const [existing] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.id, id),
          eq(tickets.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    if (fields.projectId !== undefined && fields.projectId !== existing.projectId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, fields.projectId),
            eq(projects.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!project) {
        return null;
      }
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        if (key === "dueDate") {
          updates[key] = value ? new Date(value as string) : value;
        } else {
          updates[key] = value;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    const [updated] = await db
      .update(tickets)
      .set(updates)
      .where(and(eq(tickets.id, id), eq(tickets.userId, ctx.user.id)))
      .returning();

    // Check if status changed and emit status_changed event
    if (fields.status !== undefined && fields.status !== existing.status) {
      await emitEvent(
        { insert: async () => {} },
        {
          type: EVENT_TYPE.TICKET_STATUS_CHANGED,
          userId: ctx.user.id,
          source: "app",
          entity: { type: "ticket", id },
          payload: { status: fields.status },
          changes: {
            before: { status: existing.status },
            after: { status: fields.status },
          },
        },
      );
    }

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.TICKET_UPDATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "ticket", id },
        payload: updates,
        changes: {
          before: existing,
          after: updated,
        },
      },
    );

    return updated ?? null;
  });
