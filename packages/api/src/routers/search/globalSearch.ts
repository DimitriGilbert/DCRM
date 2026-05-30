import type { LeadStage, ProjectStatus, TicketStatus } from "@DCRM/domain";

import { protectedProcedure } from "../../index.js";
import { globalSearchSchema } from "./schemas.js";
import type { GlobalSearchInput, GlobalSearchResult, SearchableEntityType } from "./schemas.js";

export const globalSearch = protectedProcedure.input(globalSearchSchema).query(async ({ ctx, input }) => {
  const userId = ctx.auth.user.id;
  const activeEntityTypes = new Set<SearchableEntityType>(input.entityTypes ?? ["client", "lead", "project", "ticket", "exchange"]);
  const leadStage = leadStageFromStatus(input.status);
  const projectStatus = projectStatusFromStatus(input.status);
  const ticketStatus = ticketStatusFromStatus(input.status);
  const shouldSearchLeads = activeEntityTypes.has("lead") && (!input.status || leadStage !== undefined);
  const shouldSearchProjects = activeEntityTypes.has("project") && (!input.status || projectStatus !== undefined);
  const shouldSearchTickets = activeEntityTypes.has("ticket") && (!input.status || ticketStatus !== undefined);
  const searches = await Promise.all([
    activeEntityTypes.has("client") && !input.status ? ctx.crmRepository.clients.list({ userId, search: input.search, tagIds: input.tagIds, createdFrom: input.dateFrom, createdTo: input.dateTo }).then((records) => records.map((record): GlobalSearchResult => ({ entityType: "client", entityId: record.id, title: record.name, description: record.company ?? record.email, href: `/clients/${record.id}`, status: null, matchedAt: record.createdAt }))) : Promise.resolve<readonly GlobalSearchResult[]>([]),
    shouldSearchLeads ? ctx.crmRepository.leads.list({ userId, search: input.search, stage: leadStage, tagIds: input.tagIds, createdFrom: input.dateFrom, createdTo: input.dateTo, includeConverted: true }).then((records) => records.map((record): GlobalSearchResult => ({ entityType: "lead", entityId: record.id, title: record.name, description: record.company ?? record.source ?? record.email, href: `/leads/${record.id}`, status: record.stage, matchedAt: record.createdAt }))) : Promise.resolve<readonly GlobalSearchResult[]>([]),
    shouldSearchProjects ? ctx.crmRepository.projects.list({ userId, search: input.search, status: projectStatus, tagIds: input.tagIds, createdFrom: input.dateFrom, createdTo: input.dateTo }).then((records) => records.map((record): GlobalSearchResult => ({ entityType: "project", entityId: record.id, title: record.name, description: record.description, href: `/projects/${record.id}`, status: record.status, matchedAt: record.createdAt }))) : Promise.resolve<readonly GlobalSearchResult[]>([]),
    shouldSearchTickets ? ctx.crmRepository.tickets.list({ userId, search: input.search, status: ticketStatus, tagIds: input.tagIds, createdFrom: input.dateFrom, createdTo: input.dateTo }).then((records) => records.map((record): GlobalSearchResult => ({ entityType: "ticket", entityId: record.id, title: record.title, description: record.description, href: `/tickets/${record.id}`, status: record.status, matchedAt: record.createdAt }))) : Promise.resolve<readonly GlobalSearchResult[]>([]),
    activeEntityTypes.has("exchange") && !input.status ? ctx.crmRepository.exchanges.list({ userId, search: input.search, type: input.exchangeType, tagIds: input.tagIds, occurredFrom: input.dateFrom, occurredTo: input.dateTo }).then((records) => records.map((record): GlobalSearchResult => ({ entityType: "exchange", entityId: record.id, title: record.subject ?? exchangeTitle(record.body), description: exchangeDescription(record.body), href: `/search?exchangeId=${encodeURIComponent(record.id)}`, status: record.type, matchedAt: record.occurredAt }))) : Promise.resolve<readonly GlobalSearchResult[]>([]),
  ]);

  return searches.flat().sort(compareSearchResults).slice(0, input.limit);
});

function leadStageFromStatus(status: GlobalSearchInput["status"]): LeadStage | undefined {
  switch (status) {
    case "new":
    case "contacted":
    case "qualified":
    case "proposal":
    case "won":
    case "lost":
      return status;
    default:
      return undefined;
  }
}

function projectStatusFromStatus(status: GlobalSearchInput["status"]): ProjectStatus | undefined {
  switch (status) {
    case "planning":
    case "active":
    case "on_hold":
    case "completed":
    case "archived":
      return status;
    default:
      return undefined;
  }
}

function ticketStatusFromStatus(status: GlobalSearchInput["status"]): TicketStatus | undefined {
  switch (status) {
    case "open":
    case "closed":
      return status;
    default:
      return undefined;
  }
}

function exchangeTitle(body: string): string {
  return truncateSnippet(body, 48);
}

function exchangeDescription(body: string): string {
  return truncateSnippet(body, 160);
}

function truncateSnippet(value: string, maxLength: number): string {
  const normalized = value.trim().replaceAll(/\s+/gu, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function compareSearchResults(left: GlobalSearchResult, right: GlobalSearchResult): number {
  return right.matchedAt.getTime() - left.matchedAt.getTime() || left.entityType.localeCompare(right.entityType) || left.title.localeCompare(right.title);
}
