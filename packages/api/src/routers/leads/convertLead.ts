import { protectedProcedure } from "../../index.js";
import { conflict, notFound } from "./helpers.js";
import { leadIdSchema } from "./schemas.js";

export const convertLead = protectedProcedure.input(leadIdSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.leads.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Lead not found.");
  }
  if (before.convertedAt) {
    throw conflict("Lead has already been converted.");
  }
  if (before.stage !== "won") {
    throw conflict("Only won leads can be converted.");
  }
  const result = await ctx.crmRepository.leads.convert({ userId: ctx.auth.user.id, leadId: input.id, clientId: crypto.randomUUID(), now: new Date() });
  if (!result) {
    throw conflict("Lead has already been converted.");
  }
  if (before.stage !== result.lead.stage) {
    await ctx.eventService.emitApi({ type: "lead.stage_changed", userId: ctx.auth.user.id, entity: { type: "lead", id: result.lead.id }, payload: { id: result.lead.id, from: before.stage, to: result.lead.stage }, changes: { before: { stage: before.stage }, after: { stage: result.lead.stage } } });
  }
  await ctx.eventService.emitApi({
    type: "lead.converted",
    userId: ctx.auth.user.id,
    entity: { type: "lead", id: result.lead.id },
    payload: { id: result.lead.id, clientId: result.client.id },
    changes: { before: { convertedClientId: null, convertedAt: null }, after: { convertedClientId: result.client.id, convertedAt: result.lead.convertedAt, stage: result.lead.stage } },
  });
  await ctx.eventService.emitApi({
    type: "client.created",
    userId: ctx.auth.user.id,
    entity: { type: "client", id: result.client.id },
    payload: { id: result.client.id, name: result.client.name, convertedFromLeadId: result.lead.id },
    changes: { after: { name: result.client.name, email: result.client.email, company: result.client.company } },
  });
  return result;
});
