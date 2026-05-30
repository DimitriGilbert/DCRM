import { TRPCError } from "@trpc/server";

import { protectedProcedure } from "../../index.js";
import { isStatusChange, normalizeUpdateProjectFields, notFound } from "./helpers.js";
import { projectUpdateFieldsSchema } from "./schemas.js";

export const updateProject = protectedProcedure.input(projectUpdateFieldsSchema).mutation(async ({ ctx, input }) => {
  const before = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.id });
  if (!before || before.deletedAt) {
    throw notFound("Project not found.");
  }
  if (input.clientId !== undefined) {
    const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.clientId });
    if (!client || client.deletedAt) {
      throw notFound("Client not found.");
    }
  }
  const project = await ctx.crmRepository.projects.update({ userId: ctx.auth.user.id, id: input.id, fields: normalizeUpdateProjectFields(input), now: new Date(), expectedStatus: before.status });
  if (!project) {
    const current = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.id });
    if (!current || current.deletedAt) {
      throw notFound("Project not found.");
    }
    throw new TRPCError({ code: "CONFLICT", message: "Project status changed before this update could be applied." });
  }
  await ctx.eventService.emitApi({
    type: "project.updated",
    userId: ctx.auth.user.id,
    entity: { type: "project", id: project.id },
    payload: { id: project.id },
    changes: {
      before: { clientId: before.clientId, name: before.name, status: before.status, budgetAmount: before.budgetAmount, budgetCurrency: before.budgetCurrency, estimatedHours: before.estimatedHours, actualHours: before.actualHours, customFields: before.customFields },
      after: { clientId: project.clientId, name: project.name, status: project.status, budgetAmount: project.budgetAmount, budgetCurrency: project.budgetCurrency, estimatedHours: project.estimatedHours, actualHours: project.actualHours, customFields: project.customFields },
    },
  });
  if (input.status !== undefined && isStatusChange(before.status, project.status)) {
    await ctx.eventService.emitApi({ type: "project.status_changed", userId: ctx.auth.user.id, entity: { type: "project", id: project.id }, payload: { id: project.id, from: before.status, to: project.status }, changes: { before: { status: before.status }, after: { status: project.status } } });
  }
  return project;
});
