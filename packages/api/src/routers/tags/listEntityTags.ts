import { protectedProcedure } from "../../index.js";
import { entityTagSchema } from "./schemas.js";

export const listEntityTags = protectedProcedure.input(entityTagSchema.omit({ tagId: true })).query(async ({ ctx, input }) => {
  if (input.entityType === "client") {
    const client = await ctx.crmRepository.clients.getById({ userId: ctx.auth.user.id, id: input.entityId });
    if (!client || client.deletedAt) {
      return [];
    }
  } else {
    const project = await ctx.crmRepository.projects.getById({ userId: ctx.auth.user.id, id: input.entityId });
    if (!project || project.deletedAt) {
      return [];
    }
  }

  const entityTags = await ctx.crmRepository.entityTags.listForEntity({ userId: ctx.auth.user.id, entityType: input.entityType, entityId: input.entityId });
  const activeTags = await Promise.all(entityTags.map((entityTag) => ctx.crmRepository.tags.getById({ userId: ctx.auth.user.id, id: entityTag.tagId })));
  const activeTagIds = new Set<string>();
  for (const tag of activeTags) {
    if (tag && !tag.deletedAt) {
      activeTagIds.add(tag.id);
    }
  }
  return entityTags.filter((entityTag) => activeTagIds.has(entityTag.tagId));
});
