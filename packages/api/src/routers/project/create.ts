import { db } from "@DCRM/db";
import { clients, projects } from "@DCRM/db/schema/crm";
import type { ProjectStatus } from "@DCRM/domain";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createProjectSchema } from "./schemas";

async function createProjectInDb(
  userId: string,
  input: {
    name: string;
    clientId: string;
    description?: string;
    status?: ProjectStatus;
    budgetAmount?: number;
    budgetCurrency?: string;
    estimatedHours?: number;
    actualHours?: number;
    customFields?: Record<string, unknown>;
    startDate?: string;
    endDate?: string;
  },
) {
  const id = nanoid();
  const now = new Date();

  const row = {
    id,
    userId,
    clientId: input.clientId,
    name: input.name,
    description: input.description ?? null,
    status: (input.status ?? "planning") as ProjectStatus,
    budgetAmount: input.budgetAmount ?? null,
    budgetCurrency: input.budgetCurrency ?? null,
    estimatedHours: input.estimatedHours ?? null,
    actualHours: input.actualHours ?? null,
    customFields: input.customFields ?? null,
    startDate: input.startDate ? new Date(input.startDate) : null,
    endDate: input.endDate ? new Date(input.endDate) : null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.insert(projects).values(row);

  return row;
}

export const createProject = protectedProcedure
  .input(createProjectSchema)
  .mutation(async ({ ctx, input }) => {
    // Verify client ownership
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

    const row = await createProjectInDb(ctx.user.id, input);

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.PROJECT_CREATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "project", id: row.id },
        payload: { name: row.name, clientId: row.clientId, status: row.status },
      },
    );

    return row;
  });

export { createProjectInDb };
