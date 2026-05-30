import { protectedProcedure } from "../../index.js";
import { notFound } from "./helpers.js";
import { projectIdSchema } from "./schemas.js";

export const deleteProject = protectedProcedure.input(projectIdSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before) {
    throw notFound("Project not found.");
  }
  if (before.deletedAt) {
    return before;
  }
  const now = new Date();
  const project = await ctx.crmRepository.projects.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: now, now });
  if (!project) {
    throw notFound("Project not found.");
  }
  await ctx.eventService.emitApi({ type: "project.deleted", userId: ctx.auth.user.id, entity: { type: "project", id: project.id }, payload: { id: project.id } });
  return project;
});
