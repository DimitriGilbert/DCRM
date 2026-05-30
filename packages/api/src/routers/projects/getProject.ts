import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { projectIdSchema } from "./schemas.js";

export const getProject = protectedProcedure.input(projectIdSchema).query(async ({ ctx, input }) => {
  const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!project) {
    throw notFound("Project not found.");
  }
  return project;
});
