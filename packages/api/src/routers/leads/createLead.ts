import { protectedProcedure } from "../../index.js";
import { normalizeCreateLeadFields } from "./helpers.js";
import { leadFieldsSchema } from "./schemas.js";

export const createLead = protectedProcedure.input(leadFieldsSchema).mutation(async ({ ctx, input }) => {
  const now = new Date();
  const lead = await ctx.crmRepository.leads.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields: normalizeCreateLeadFields(input), now });
  await ctx.eventService.emitApi({
    type: "lead.created",
    userId: ctx.auth.user.id,
    entity: { type: "lead", id: lead.id },
    payload: { id: lead.id, name: lead.name, stage: lead.stage },
    changes: { after: { name: lead.name, email: lead.email, company: lead.company, stage: lead.stage } },
  });
  return lead;
});
