import { db } from "@DCRM/db";
import { clients, projects } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { updateProjectSchema } from "./schemas";

export const updateProject = protectedProcedure
  .input(updateProjectSchema)
  .mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;

    const [existing] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    // If clientId is being changed, verify new client ownership
    if (fields.clientId !== undefined && fields.clientId !== null && fields.clientId !== existing.clientId) {
      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.id, fields.clientId),
            eq(clients.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!client) {
        return null;
      }
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        if (key === "startDate" || key === "endDate") {
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
      .update(projects)
      .set(updates)
      .where(and(eq(projects.id, id), eq(projects.userId, ctx.user.id)))
      .returning();

    // Check if status changed and emit status_changed event
    if (fields.status !== undefined && fields.status !== existing.status) {
      await emitEvent(
        { insert: async () => {} },
        {
          type: EVENT_TYPE.PROJECT_STATUS_CHANGED,
          userId: ctx.user.id,
          source: "app",
          entity: { type: "project", id },
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
        type: EVENT_TYPE.PROJECT_UPDATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "project", id },
        payload: updates,
        changes: {
          before: existing,
          after: updated,
        },
      },
    );

    return updated ?? null;
  });
