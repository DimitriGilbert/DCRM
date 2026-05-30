import { TRPCError } from "@trpc/server";

import { protectedProcedure } from "../../index.js";
import { notificationIdSchema } from "./schemas.js";

export const markNotificationRead = protectedProcedure.input(notificationIdSchema).mutation(async ({ ctx, input }) => {
  const notification = await ctx.crmRepository.notifications.markRead({ userId: ctx.auth.user.id, id: input.id, now: new Date() });
  if (!notification) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found." });
  }
  return notification;
});
