import { db } from "@DCRM/db";
import {
  clients,
  leads,
  projects,
  tickets,
  exchanges,
  entityTags,
} from "@DCRM/db/schema/crm";
import {
  eq,
  and,
  isNull,
  or,
  ilike,
  desc,
  gte,
  lte,
  inArray,
} from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { escapeLikeWildcards } from "../../utils/escape-like";
import {
  globalSearchSchema,
  SEARCH_ENTITY_TYPES,
} from "./schemas";
import type { SearchResultItem, SearchEntityType } from "./schemas";

/**
 * Builds a date-range condition from optional ISO date strings.
 * Both bounds are inclusive (gte/lte on the column).
 */
function dateRangeCondition(
  column: Parameters<typeof gte>[0],
  from: string | undefined,
  to: string | undefined,
) {
  const conds = [];
  if (from) conds.push(gte(column, new Date(from)));
  if (to) conds.push(lte(column, new Date(to)));
  return conds;
}

/**
 * Resolves entity IDs that have any of the given tagIds, scoped to
 * a specific entityType and userId.
 */
async function resolveEntityIdsByTags(
  entityType: string,
  tagIds: string[],
): Promise<string[]> {
  const rows = await db
    .select({ entityId: entityTags.entityId })
    .from(entityTags)
    .where(
      and(
        eq(entityTags.entityType, entityType),
        inArray(entityTags.tagId, tagIds),
      ),
    );

  const set = new Set(rows.map((r) => r.entityId));
  return [...set];
}

/**
 * Searches clients by name, email, company, website.
 */
async function searchClients(
  userId: string,
  pattern: string,
  limit: number,
  tagIds: string[] | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
): Promise<SearchResultItem[]> {
  let conditions = [
    eq(clients.userId, userId),
    isNull(clients.deletedAt),
    or(
      ilike(clients.name, pattern),
      ilike(clients.email, pattern),
      ilike(clients.company, pattern),
      ilike(clients.website, pattern),
    ),
  ];

  const dateConds = dateRangeCondition(clients.createdAt, dateFrom, dateTo);
  conditions = [...conditions, ...dateConds];

  if (tagIds && tagIds.length > 0) {
    const matchingIds = await resolveEntityIdsByTags("client", tagIds);
    if (matchingIds.length === 0) return [];
    conditions.push(inArray(clients.id, matchingIds));
  }

  const rows = await db
    .select()
    .from(clients)
    .where(and(...conditions))
    .orderBy(desc(clients.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: "client" as SearchEntityType,
    label: r.name,
    sublabel: r.email ?? r.company ?? null,
    status: null,
    createdAt: r.createdAt,
  }));
}

/**
 * Searches leads by name, email, company, website, source.
 */
async function searchLeads(
  userId: string,
  pattern: string,
  limit: number,
  tagIds: string[] | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
): Promise<SearchResultItem[]> {
  let conditions = [
    eq(leads.userId, userId),
    isNull(leads.deletedAt),
    or(
      ilike(leads.name, pattern),
      ilike(leads.email, pattern),
      ilike(leads.company, pattern),
      ilike(leads.website, pattern),
      ilike(leads.source, pattern),
    ),
  ];

  const dateConds = dateRangeCondition(leads.createdAt, dateFrom, dateTo);
  conditions = [...conditions, ...dateConds];

  if (tagIds && tagIds.length > 0) {
    const matchingIds = await resolveEntityIdsByTags("lead", tagIds);
    if (matchingIds.length === 0) return [];
    conditions.push(inArray(leads.id, matchingIds));
  }

  const rows = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: "lead" as SearchEntityType,
    label: r.name,
    sublabel: r.email ?? r.company ?? null,
    status: r.stage,
    createdAt: r.createdAt,
  }));
}

/**
 * Searches projects by name, description.
 */
async function searchProjects(
  userId: string,
  pattern: string,
  limit: number,
  tagIds: string[] | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
): Promise<SearchResultItem[]> {
  let conditions = [
    eq(projects.userId, userId),
    isNull(projects.deletedAt),
    or(
      ilike(projects.name, pattern),
      ilike(projects.description, pattern),
    ),
  ];

  const dateConds = dateRangeCondition(projects.createdAt, dateFrom, dateTo);
  conditions = [...conditions, ...dateConds];

  if (tagIds && tagIds.length > 0) {
    const matchingIds = await resolveEntityIdsByTags("project", tagIds);
    if (matchingIds.length === 0) return [];
    conditions.push(inArray(projects.id, matchingIds));
  }

  const rows = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: "project" as SearchEntityType,
    label: r.name,
    sublabel: r.description ?? null,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

/**
 * Searches tickets by title, description.
 */
async function searchTickets(
  userId: string,
  pattern: string,
  limit: number,
  tagIds: string[] | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
): Promise<SearchResultItem[]> {
  let conditions = [
    eq(tickets.userId, userId),
    isNull(tickets.deletedAt),
    or(
      ilike(tickets.title, pattern),
      ilike(tickets.description, pattern),
    ),
  ];

  const dateConds = dateRangeCondition(tickets.createdAt, dateFrom, dateTo);
  conditions = [...conditions, ...dateConds];

  if (tagIds && tagIds.length > 0) {
    const matchingIds = await resolveEntityIdsByTags("ticket", tagIds);
    if (matchingIds.length === 0) return [];
    conditions.push(inArray(tickets.id, matchingIds));
  }

  const rows = await db
    .select()
    .from(tickets)
    .where(and(...conditions))
    .orderBy(desc(tickets.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: "ticket" as SearchEntityType,
    label: r.title,
    sublabel: r.description ?? null,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

/**
 * Searches exchanges by subject, body.
 */
async function searchExchanges(
  userId: string,
  pattern: string,
  limit: number,
  dateFrom: string | undefined,
  dateTo: string | undefined,
): Promise<SearchResultItem[]> {
  const conditions = [
    eq(exchanges.userId, userId),
    or(
      ilike(exchanges.subject, pattern),
      ilike(exchanges.body, pattern),
    ),
    ...dateRangeCondition(exchanges.createdAt, dateFrom, dateTo),
  ];

  const rows = await db
    .select()
    .from(exchanges)
    .where(and(...conditions))
    .orderBy(desc(exchanges.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: "exchange" as SearchEntityType,
    label: r.subject ?? "(no subject)",
    sublabel: r.body ? r.body.slice(0, 100) : null,
    status: r.type,
    createdAt: r.createdAt,
  }));
}

export const globalSearch = protectedProcedure
  .input(globalSearchSchema)
  .query(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const pattern = `%${escapeLikeWildcards(input.query)}%`;
    const { limit, entityTypes, tagIds, dateFrom, dateTo } = input;

    const types = entityTypes ?? SEARCH_ENTITY_TYPES;
    const perTypeLimit = Math.min(limit, 20);

    const searchers: Promise<SearchResultItem[]>[] = [];

    if (types.includes("client")) {
      searchers.push(
        searchClients(userId, pattern, perTypeLimit, tagIds, dateFrom, dateTo),
      );
    }
    if (types.includes("lead")) {
      searchers.push(
        searchLeads(userId, pattern, perTypeLimit, tagIds, dateFrom, dateTo),
      );
    }
    if (types.includes("project")) {
      searchers.push(
        searchProjects(userId, pattern, perTypeLimit, tagIds, dateFrom, dateTo),
      );
    }
    if (types.includes("ticket")) {
      searchers.push(
        searchTickets(userId, pattern, perTypeLimit, tagIds, dateFrom, dateTo),
      );
    }
    if (types.includes("exchange")) {
      searchers.push(
        searchExchanges(userId, pattern, perTypeLimit, dateFrom, dateTo),
      );
    }

    const results = await Promise.all(searchers);
    const allItems = results.flat();

    // Sort by createdAt descending, then enforce overall limit
    allItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      items: allItems.slice(0, limit),
      total: allItems.length,
    };
  });
