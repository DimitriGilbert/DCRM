import { protectedProcedure } from "../../index.js";
import { conflict, isStageChange, normalizeUpdateLeadFields, notFound } from "./helpers.js";
import { leadUpdateFieldsSchema } from "./schemas.js";

export const updateLead = protectedProcedure.input(leadUpdateFieldsSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.leads.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Lead not found.");
  }
  if (before.convertedAt && input.stage !== undefined && input.stage !== "won") {
    throw conflict("Converted leads must remain in the won stage.");
  }
  const fields = normalizeUpdateLeadFields(input, before);
  const lead = await ctx.crmRepository.leads.update({ userId: ctx.auth.user.id, id: input.id, fields, now: new Date() });
  if (!lead) {
    throw notFound("Lead not found.");
  }
  await ctx.eventService.emitApi({
    type: "lead.updated",
    userId: ctx.auth.user.id,
    entity: { type: "lead", id: lead.id },
    payload: { id: lead.id },
    changes: { before: { name: before.name, email: before.email, company: before.company, stage: before.stage, customFields: before.customFields }, after: { name: lead.name, email: lead.email, company: lead.company, stage: lead.stage, customFields: lead.customFields } },
  });
  if (isStageChange(before.stage, lead.stage)) {
    await ctx.eventService.emitApi({ type: "lead.stage_changed", userId: ctx.auth.user.id, entity: { type: "lead", id: lead.id }, payload: { id: lead.id, from: before.stage, to: lead.stage }, changes: { before: { stage: before.stage }, after: { stage: lead.stage } } });
  }
  return lead;
});
