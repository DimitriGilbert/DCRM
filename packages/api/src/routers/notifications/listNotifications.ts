import { protectedProcedure } from "../../index.js";
import { listNotificationsSchema } from "./schemas.js";

export const listNotifications = protectedProcedure.input(listNotificationsSchema).query(({ ctx, input }) => {
  return ctx.crmRepository.notifications.list({ userId: ctx.auth.user.id, unreadOnly: input.unreadOnly, limit: input.limit });
});
