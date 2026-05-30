import { protectedProcedure } from "../../index.js";
import { tagNotFound } from "./helpers.js";
import { tagIdSchema } from "./schemas.js";

export const deleteTag = protectedProcedure.input(tagIdSchema).mutation(async ({ ctx, input }) => {
  const tag = await ctx.crmRepository.tags.setDeletedAt({ userId: ctx.auth.user.id, id: input.id, deletedAt: new Date(), now: new Date() });
  if (!tag) {
    throw tagNotFound();
  }
  await ctx.eventService.emitApi({ type: "tag.deleted", userId: ctx.auth.user.id, entity: { type: "tag", id: tag.id }, payload: { tagId: tag.id } });
  return tag;
});
