import { protectedProcedure } from "../../index.js";
import { timelineSchema } from "./schemas.js";

export const listTimeline = protectedProcedure.input(timelineSchema).query(async ({ ctx, input }) => {
  return ctx.crmRepository.exchanges.listTimeline({ userId: ctx.auth.user.id, ...input });
});
