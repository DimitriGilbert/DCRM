import { protectedProcedure } from "../../index.js";
import { assertAttachmentTarget } from "./helpers.js";
import { attachmentTargetSchema } from "./schemas.js";

export const listForTarget = protectedProcedure.input(attachmentTargetSchema).query(async ({ ctx, input }) => {
  await assertAttachmentTarget(ctx, input.targetType, input.targetId);
  return ctx.crmRepository.attachments.listForTarget({ userId: ctx.auth.user.id, targetType: input.targetType, targetId: input.targetId });
});
