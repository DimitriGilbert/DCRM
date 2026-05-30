import { protectedProcedure } from "../../index.js";
import { entityTagSchema } from "./schemas.js";

export const detachTag = protectedProcedure.input(entityTagSchema).mutation(async ({ ctx, input }) => {
  const detached = await ctx.crmRepository.entityTags.detach({ userId: ctx.auth.user.id, tagId: input.tagId, entityType: input.entityType, entityId: input.entityId });
  if (detached && input.entityType === "client") {
    await ctx.eventService.emitApi({ type: "client.updated", userId: ctx.auth.user.id, entity: { type: "client", id: input.entityId }, payload: { tagId: input.tagId, action: "tag.detached" } });
  }
  return { detached };
});
