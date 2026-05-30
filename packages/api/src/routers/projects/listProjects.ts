import { protectedProcedure } from "../../index.js";
import { listProjectsSchema } from "./schemas.js";

export const listProjects = protectedProcedure.input(listProjectsSchema).query(({ ctx, input }) => {
  return ctx.crmRepository.projects.list({ userId: ctx.auth.user.id, clientId: input.clientId, search: input.search, status: input.status, tagIds: input.tagIds, createdFrom: input.createdFrom, createdTo: input.createdTo, includeDeleted: input.includeDeleted });
});
