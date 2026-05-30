import { TRPCError } from "@trpc/server";
import type { AttachmentTargetType } from "@DCRM/domain";

import type { Context, ContextStorage } from "../../context.js";

import { encodedBase64LengthForByteSize, hasExpectedBase64Padding, hasExpectedEncodedLength, isCanonicalBase64String, isDotSegment } from "./schemas.js";

export function requireStorage(ctx: Context): ContextStorage {
  if (!ctx.storage) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Attachment storage is not configured." });
  }
  return ctx.storage;
}

export async function assertAttachmentTarget(ctx: Context & { readonly auth: NonNullable<Context["auth"]> }, targetType: AttachmentTargetType, targetId: string): Promise<void> {
  const userId = ctx.auth.user.id;
  switch (targetType) {
    case "client": {
      const client = await ctx.crmRepository.clients.getById({ userId, id: targetId });
      assertActiveTarget(Boolean(client && !client.deletedAt));
      return;
    }
    case "lead": {
      const lead = await ctx.crmRepository.leads.getById({ userId, id: targetId });
      assertActiveTarget(Boolean(lead && !lead.deletedAt));
      return;
    }
    case "project": {
      const project = await ctx.crmRepository.projects.getById({ userId, id: targetId });
      assertActiveTarget(Boolean(project && !project.deletedAt));
      const client = project ? await ctx.crmRepository.clients.getById({ userId, id: project.clientId }) : undefined;
      assertActiveTarget(Boolean(client && !client.deletedAt));
      return;
    }
    case "ticket": {
      const ticket = await ctx.crmRepository.tickets.getById({ userId, id: targetId });
      if (!ticket || ticket.deletedAt) {
        assertActiveTarget(false);
        return;
      }
      await assertAttachmentTarget(ctx, "project", ticket.projectId);
      return;
    }
    case "exchange": {
      const exchange = await ctx.crmRepository.exchanges.getById({ userId, id: targetId });
      if (!exchange || exchange.deletedAt) {
        assertActiveTarget(false);
        return;
      }
      if (exchange.ticketId) {
        await assertAttachmentTarget(ctx, "ticket", exchange.ticketId);
        return;
      }
      if (exchange.projectId) {
        await assertAttachmentTarget(ctx, "project", exchange.projectId);
        return;
      }
      if (exchange.clientId) {
        await assertAttachmentTarget(ctx, "client", exchange.clientId);
      }
      return;
    }
  }
}

function assertActiveTarget(active: boolean): void {
  if (!active) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Attachment target not found." });
  }
}

export function decodeAttachmentContent(contentBase64: string, expectedByteSize: number): Buffer {
  if (!isCanonicalBase64String(contentBase64) || !hasExpectedEncodedLength(contentBase64, expectedByteSize) || !hasExpectedBase64Padding(contentBase64, expectedByteSize)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment content is not valid canonical base64 for the declared byte size." });
  }
  const content = Buffer.from(contentBase64, "base64");
  if (content.byteLength !== expectedByteSize) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment byte size does not match uploaded content." });
  }
  return content;
}

export function assertAttachmentUploadBounds(contentBase64: string, expectedByteSize: number, maxAttachmentBytes: number): void {
  if (expectedByteSize > maxAttachmentBytes) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Attachment exceeds the configured file size limit." });
  }

  if (contentBase64.length > encodedBase64LengthForByteSize(maxAttachmentBytes)) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Attachment exceeds the configured file size limit." });
  }

  if (!hasExpectedEncodedLength(contentBase64, expectedByteSize)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment base64 length does not match declared byte size." });
  }
}

export function safeStorageFileName(fileName: string): string {
  if (isDotSegment(fileName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment file name cannot be a dot segment." });
  }
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/gu, "_");
  if (isDotSegment(safeName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment file name cannot be a dot segment." });
  }
  return safeName;
}
