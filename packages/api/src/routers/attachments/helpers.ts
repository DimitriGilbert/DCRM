import { TRPCError } from "@trpc/server";
import type { AttachmentTargetType } from "@DCRM/domain";

import type { Context, ContextStorage } from "../../context.js";

export function requireStorage(ctx: Context): ContextStorage {
  if (!ctx.storage) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Attachment storage is not configured." });
  }
  return ctx.storage;
}

export async function assertAttachmentTarget(ctx: Context & { readonly auth: NonNullable<Context["auth"]> }, targetType: AttachmentTargetType, targetId: string): Promise<void> {
  const userId = ctx.auth.user.id;
  const record = targetType === "client"
    ? await ctx.crmRepository.clients.getById({ userId, id: targetId })
    : targetType === "lead"
      ? await ctx.crmRepository.leads.getById({ userId, id: targetId })
      : targetType === "project"
        ? await ctx.crmRepository.projects.getById({ userId, id: targetId })
        : targetType === "ticket"
          ? await ctx.crmRepository.tickets.getById({ userId, id: targetId })
          : await ctx.crmRepository.exchanges.getById({ userId, id: targetId });

  if (!record || record.deletedAt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Attachment target not found." });
  }
}

export function decodeAttachmentContent(contentBase64: string, expectedByteSize: number): Buffer {
  const content = Buffer.from(contentBase64, "base64");
  if (content.byteLength !== expectedByteSize) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment byte size does not match uploaded content." });
  }
  return content;
}

export function safeStorageFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/gu, "_");
}
