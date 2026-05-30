import { protectedProcedure } from "../../index.js";
import { tagNotFound } from "./helpers.js";
import { tagUpdateSchema } from "./schemas.js";

export const updateTag = protectedProcedure.input(tagUpdateSchema).mutation(async ({ ctx, input }) => {
  const { id, ...fields } = input;
  const tag = await ctx.crmRepository.tags.update({ userId: ctx.auth.user.id, id, fields, now: new Date() });
  if (!tag) {
    throw tagNotFound();
  }
  await ctx.eventService.emitApi({ type: "tag.updated", userId: ctx.auth.user.id, entity: { type: "tag", id: tag.id }, payload: { tagId: tag.id } });
  return tag;
});
