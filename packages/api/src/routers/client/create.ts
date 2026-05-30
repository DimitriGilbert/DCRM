import { db } from "@DCRM/db";
import { clients } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createClientSchema } from "./schemas";

async function createClientInDb(
  userId: string,
  input: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    website?: string;
    notes?: string;
    socialLinks?: Record<string, string>;
    address?: Record<string, string>;
    customFields?: Record<string, unknown>;
  },
) {
  const id = nanoid();
  const now = new Date();

  const row = {
    id,
    userId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    company: input.company ?? null,
    website: input.website ?? null,
    notes: input.notes ?? null,
    socialLinks: input.socialLinks ?? null,
    address: input.address ?? null,
    customFields: input.customFields ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.insert(clients).values(row);

  return row;
}

export const createClient = protectedProcedure
  .input(createClientSchema)
  .mutation(async ({ ctx, input }) => {
    const row = await createClientInDb(ctx.user.id, input);

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.CLIENT_CREATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "client", id: row.id },
        payload: { name: row.name, email: row.email },
      },
    );

    return row;
  });

export { createClientInDb };
