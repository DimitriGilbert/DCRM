import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { leadIdSchema } from "./schemas.js";

export const getLead = protectedProcedure.input(leadIdSchema).query(async ({ ctx, input }) => {
  const lead = await ctx.crmRepository.leads.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!lead || lead.deletedAt) {
    throw notFound("Lead not found.");
  }
  return lead;
});
