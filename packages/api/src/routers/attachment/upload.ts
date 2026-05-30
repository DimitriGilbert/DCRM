import { db } from "@DCRM/db";
import {
  attachments,
  clients,
  leads,
  projects,
  tickets,
  exchanges,
} from "@DCRM/db/schema/crm";
import { emitEvent, EVENT_TYPE } from "@DCRM/events";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { uploadAttachmentSchema } from "./schemas";

const ENTITY_TABLES = {
  client: clients,
  lead: leads,
  project: projects,
  ticket: tickets,
  exchange: exchanges,
} as const;

async function verifyEntityOwnership(
  entityType: keyof typeof ENTITY_TABLES,
  entityId: string,
  userId: string,
): Promise<boolean> {
  const table = ENTITY_TABLES[entityType];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.userId, userId)))
    .limit(1);
  return !!row;
}

export const uploadAttachment = protectedProcedure
  .input(uploadAttachmentSchema)
  .mutation(async ({ ctx, input }) => {
    const owned = await verifyEntityOwnership(
      input.entityType,
      input.entityId,
      ctx.user.id,
    );
    if (!owned) {
      return null;
    }

    const id = nanoid();
    const storageKey = `${input.entityType}/${input.entityId}/${id}/${input.fileName}`;

    const now = new Date();
    const row = {
      id,
      userId: ctx.user.id,
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      filePath: storageKey,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      metadata: null as Record<string, unknown> | null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(attachments).values(row);

    await emitEvent(
      { insert: async () => {} },
      {
        type: EVENT_TYPE.FILE_ATTACHED,
        userId: ctx.user.id,
        source: "app",
        entity: { type: input.entityType, id: input.entityId },
        payload: {
          attachmentId: id,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          storageKey,
        },
      },
    );

    return { ...row, storageKey };
  });
