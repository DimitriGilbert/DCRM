import { db } from "@DCRM/db";
import {
  clients,
  leads,
  projects,
  tickets,
  exchanges,
  tags,
} from "@DCRM/db/schema/crm";
import { and, eq, isNull } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { exportListSchema } from "./schemas";
import { rowsToCsv } from "./csv-utils";

import type { EntityType } from "./schemas";

/**
 * Builds user-scoped query conditions for each entity type.
 * Returns the rows directly.
 */
async function fetchEntityRows(
  entityType: EntityType,
  userId: string,
  includeDeleted: boolean,
): Promise<Record<string, unknown>[]> {
  switch (entityType) {
    case "clients": {
      const conditions = [eq(clients.userId, userId)];
      if (!includeDeleted) conditions.push(isNull(clients.deletedAt));
      return db.select().from(clients).where(and(...conditions));
    }
    case "leads": {
      const conditions = [eq(leads.userId, userId)];
      if (!includeDeleted) conditions.push(isNull(leads.deletedAt));
      return db.select().from(leads).where(and(...conditions));
    }
    case "projects": {
      const conditions = [eq(projects.userId, userId)];
      if (!includeDeleted) conditions.push(isNull(projects.deletedAt));
      return db.select().from(projects).where(and(...conditions));
    }
    case "tickets": {
      const conditions = [eq(tickets.userId, userId)];
      if (!includeDeleted) conditions.push(isNull(tickets.deletedAt));
      return db.select().from(tickets).where(and(...conditions));
    }
    case "exchanges": {
      return db.select().from(exchanges).where(eq(exchanges.userId, userId));
    }
    case "tags": {
      return db.select().from(tags).where(eq(tags.userId, userId));
    }
  }
}

export const exportList = protectedProcedure
  .input(exportListSchema)
  .query(async ({ ctx, input }) => {
    const rows = await fetchEntityRows(
      input.entityType,
      ctx.user.id,
      input.includeDeleted,
    );

    if (input.format === "json") {
      return {
        format: "json" as const,
        data: rows,
        count: rows.length,
      };
    }

    return {
      format: "csv" as const,
      data: rowsToCsv(rows),
      count: rows.length,
    };
  });
