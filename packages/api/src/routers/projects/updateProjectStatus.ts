import { protectedProcedure } from "../../index.js";
import { isStatusChange, notFound } from "./helpers.js";
import { updateProjectStatusSchema } from "./schemas.js";

export const updateProjectStatus = protectedProcedure.input(updateProjectStatusSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before) {
    throw notFound("Project not found.");
  }
  const project = await ctx.crmRepository.projects.update({ userId: ctx.auth.user.id, id: input.id, fields: { status: input.status }, now: new Date() });
  if (!project) {
    throw notFound("Project not found.");
  }
  if (isStatusChange(before.status, project.status)) {
    await ctx.eventService.emitApi({ type: "project.status_changed", userId: ctx.auth.user.id, entity: { type: "project", id: project.id }, payload: { id: project.id, from: before.status, to: project.status }, changes: { before: { status: before.status }, after: { status: project.status } } });
  }
  return project;
});
