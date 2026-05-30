import { protectedProcedure } from "../../index.js";
import { groupLeadsByStage } from "./helpers.js";
import { listLeadsSchema } from "./schemas.js";

export const listLeadPipeline = protectedProcedure.input(listLeadsSchema).query(async ({ ctx, input }) => {
  const leads = await ctx.crmRepository.leads.list({ userId: ctx.auth.user.id, search: input.search, stage: input.stage, tagIds: input.tagIds, createdFrom: input.createdFrom, createdTo: input.createdTo, includeDeleted: input.includeDeleted, includeConverted: input.includeConverted });
  return groupLeadsByStage(leads);
});
