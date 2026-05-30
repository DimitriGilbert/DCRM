import { protectedProcedure } from "../../index.js";
import { entityTagSchema } from "./schemas.js";

export const listEntityTags = protectedProcedure.input(entityTagSchema.omit({ tagId: true })).query(({ ctx, input }) => {
  return ctx.crmRepository.entityTags.listForEntity({ userId: ctx.auth.user.id, entityType: input.entityType, entityId: input.entityId });
});
