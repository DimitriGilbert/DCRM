import { db } from "@DCRM/db";
import { leads, clients, attachments } from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { convertLeadSchema } from "./schemas";

export const convertLead = protectedProcedure
  .input(convertLeadSchema)
  .mutation(async ({ ctx, input }) => {
    const [lead] = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.id, input.id),
          eq(leads.userId, ctx.user.id),
          isNull(leads.deletedAt),
        ),
      )
      .limit(1);

    if (!lead) {
      return null;
    }

    if (lead.stage !== "won") {
      return null;
    }

    if (lead.convertedClientId) {
      return null;
    }

    const clientId = nanoid();
    const now = new Date();

    const clientRow = {
      id: clientId,
      userId: ctx.user.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      website: lead.website,
      notes: lead.notes,
      socialLinks: lead.socialLinks,
      address: lead.address,
      customFields: lead.customFields,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await db.insert(clients).values(clientRow);

    const [updatedLead] = await db
      .update(leads)
      .set({
        convertedClientId: clientId,
        convertedAt: now,
      })
      .where(eq(leads.id, input.id))
      .returning();

    await db
      .update(attachments)
      .set({ entityType: "client", entityId: clientId })
      .where(
        and(
          eq(attachments.entityType, "lead"),
          eq(attachments.entityId, input.id),
        ),
      );

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.LEAD_CONVERTED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: "lead", id: input.id },
        payload: {
          leadId: input.id,
          clientId,
          name: lead.name,
        },
      },
    );

    return {
      lead: updatedLead ?? null,
      client: clientRow,
    };
  });
