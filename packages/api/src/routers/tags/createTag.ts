import { protectedProcedure } from "../../index.js";
import { tagFieldsSchema } from "./schemas.js";

export const createTag = protectedProcedure.input(tagFieldsSchema).mutation(async ({ ctx, input }) => {
  const tag = await ctx.crmRepository.tags.create({ id: crypto.randomUUID(), userId: ctx.auth.user.id, fields: input, now: new Date() });
  await ctx.eventService.emitApi({ type: "tag.created", userId: ctx.auth.user.id, entity: { type: "tag", id: tag.id }, payload: { tagId: tag.id, name: tag.name } });
  return tag;
});
