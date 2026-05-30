import { db } from "@DCRM/db";
import { leads } from "@DCRM/db/schema/crm";
import type { LeadStage } from "@DCRM/domain";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { createLeadSchema } from "./schemas";

async function createLeadInDb(
  userId: string,
  input: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    website?: string;
    notes?: string;
    source?: string;
    stage?: LeadStage;
    estimatedValue?: number;
    currency?: string;
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
    source: input.source ?? null,
    stage: (input.stage ?? "new") as LeadStage,
    estimatedValue: input.estimatedValue ?? null,
    currency: input.currency ?? null,
    socialLinks: input.socialLinks ?? null,
    address: input.address ?? null,
    customFields: input.customFields ?? null,
    convertedClientId: null,
    convertedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.insert(leads).values(row);

  return row;
}

export const createLead = protectedProcedure
  .input(createLeadSchema)
  .mutation(async ({ ctx, input }) => {
    const row = await createLeadInDb(ctx.user.id, input);

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.LEAD_CREATED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "lead", id: row.id },
        payload: { name: row.name, stage: row.stage },
      },
    );

    return row;
  });

export { createLeadInDb };
