import { protectedProcedure } from "../../index.js";
import { assertEntityCanBeTagged, tagNotFound } from "./helpers.js";
import { entityTagSchema } from "./schemas.js";

export const attachTag = protectedProcedure.input(entityTagSchema).mutation(async ({ ctx, input }) => {
  const tag = await ctx.crmRepository.tags.getById({ userId: ctx.auth.user.id, id: input.tagId });
  if (!tag || tag.deletedAt) {
    throw tagNotFound();
  }
  await assertEntityCanBeTagged(ctx, input);
  const entityTag = await ctx.crmRepository.entityTags.attach({ userId: ctx.auth.user.id, tagId: input.tagId, entityType: input.entityType, entityId: input.entityId, now: new Date() });
  if (input.entityType === "client") {
    await ctx.eventService.emitApi({ type: "client.updated", userId: ctx.auth.user.id, entity: { type: "client", id: input.entityId }, payload: { tagId: input.tagId, action: "tag.attached" } });
  } else {
    await ctx.eventService.emitApi({ type: "project.updated", userId: ctx.auth.user.id, entity: { type: "project", id: input.entityId }, payload: { tagId: input.tagId, action: "tag.attached" } });
  }
  return entityTag;
});
