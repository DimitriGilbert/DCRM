import { protectedProcedure } from "../../index.js";
import { createNotificationSchema } from "./schemas.js";

export const createNotification = protectedProcedure.input(createNotificationSchema).mutation(({ ctx, input }) => {
  return ctx.crmRepository.notifications.create({
    id: crypto.randomUUID(),
    userId: ctx.auth.user.id,
    fields: {
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? "info",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    },
    now: new Date(),
  });
});
