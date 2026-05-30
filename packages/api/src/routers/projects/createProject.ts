import { protectedProcedure } from "../../index.js";
import { normalizeCreateProjectFields, notFound } from "./helpers.js";
import { projectFieldsSchema } from "./schemas.js";

export const createProject = protectedProcedure.input(projectFieldsSchema).mutation(async ({ ctx, input }) => {
  const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.clientId });
  if (!client || client.deletedAt) {
    throw notFound("Client not found.");
  }
  const now = new Date();
  const project = await ctx.crmRepository.projects.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields: normalizeCreateProjectFields(input), now });
  await ctx.eventService.emitApi({
    type: "project.created",
    userId: ctx.auth.user.id,
    entity: { type: "project", id: project.id },
    payload: { id: project.id, clientId: project.clientId, name: project.name, status: project.status },
    changes: { after: { name: project.name, clientId: project.clientId, status: project.status } },
  });
  return project;
});
