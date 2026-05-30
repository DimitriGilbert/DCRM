import { protectedProcedure } from "../../index.js";
import { listLeadsSchema } from "./schemas.js";

export const listLeads = protectedProcedure.input(listLeadsSchema).query(({ ctx, input }) => {
  return ctx.crmRepository.leads.list({ userId: ctx.auth.user.id, search: input.search, stage: input.stage, includeDeleted: input.includeDeleted, includeConverted: input.includeConverted });
});
