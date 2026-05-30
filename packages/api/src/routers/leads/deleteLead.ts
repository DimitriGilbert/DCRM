import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { leadIdSchema } from "./schemas.js";

export const deleteLead = protectedProcedure.input(leadIdSchema).mutation(async ({ ctx, input }) => {
  const now = new Date();
  const lead = await ctx.crmRepository.leads.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: now, now });
  if (!lead) {
    throw notFound("Lead not found.");
  }
  await ctx.eventService.emitApi({ type: "lead.deleted", userId: ctx.auth.user.id, entity: { type: "lead", id: lead.id }, payload: { id: lead.id } });
  return lead;
});
