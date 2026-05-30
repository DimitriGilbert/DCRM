import { protectedProcedure } from "../../index.js";
import { conflict, notFound } from "./helpers.js";
import { updateLeadStageSchema } from "./schemas.js";

export const updateLeadStage = protectedProcedure.input(updateLeadStageSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.leads.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Lead not found.");
  }
  if (before.convertedAt && input.stage !== "won") {
    throw conflict("Converted leads must remain in the won stage.");
  }
  if (before.stage === input.stage) {
    return before;
  }
  const lead = await ctx.crmRepository.leads.update({ userId: ctx.auth.user.id, id: input.id, fields: { stage: input.stage }, now: new Date() });
  if (!lead) {
    throw notFound("Lead not found.");
  }
  if (before.stage !== lead.stage) {
    await ctx.eventService.emitApi({ type: "lead.stage_changed", userId: ctx.auth.user.id, entity: { type: "lead", id: lead.id }, payload: { id: lead.id, from: before.stage, to: lead.stage }, changes: { before: { stage: before.stage }, after: { stage: lead.stage } } });
  }
  return lead;
});
