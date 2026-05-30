import { db } from "@DCRM/db";
import {
  clients,
  exchanges,
  entityTags,
  leads,
  projects,
  tags,
  tickets,
} from "@DCRM/db/schema/crm";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { protectedProcedure } from "../../index";
import { attachTagSchema } from "./schemas";

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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export const attachTag = protectedProcedure
  .input(attachTagSchema)
  .mutation(async ({ ctx, input }) => {
    const [tag] = await db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.id, input.tagId),
          eq(tags.userId, ctx.user.id),
        ),
      )
      .limit(1);

    if (!tag) {
      return null;
    }

    const owned = await verifyEntityOwnership(
      input.entityType,
      input.entityId,
      ctx.user.id,
    );
    if (!owned) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const id = nanoid();
    const now = new Date();

    const row = {
      id,
      tagId: input.tagId,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: now,
    };

    try {
      await db.insert(entityTags).values(row);
      return row;
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const [existing] = await db
        .select()
        .from(entityTags)
        .where(
          and(
            eq(entityTags.tagId, input.tagId),
            eq(entityTags.entityType, input.entityType),
            eq(entityTags.entityId, input.entityId),
          ),
        )
        .limit(1);

      return existing ?? row;
    }
  });
