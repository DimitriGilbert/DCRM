import { protectedProcedure } from "../../index.js";
import { listTagsSchema } from "./schemas.js";

export const listTags = protectedProcedure.input(listTagsSchema).query(({ ctx, input }) => {
  return ctx.crmRepository.tags.list({ userId: ctx.auth.user.id, includeDeleted: input.includeDeleted });
});
