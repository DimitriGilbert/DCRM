import { LEAD_STAGES } from "@DCRM/domain";

import { protectedProcedure } from "../../index.js";

import type { ExchangeRecord, LeadRecord, ProjectRecord, TicketRecord } from "../../crm/types.js";

const DASHBOARD_ITEM_LIMIT = 5;

type DashboardDeadline = {
  readonly id: string;
  readonly kind: "project" | "ticket";
  readonly title: string;
  readonly dueAt: string;
};

type DashboardActivity = {
  readonly id: string;
  readonly kind: ExchangeRecord["type"];
  readonly title: string;
  readonly occurredAt: string;
};

type DashboardPipelineStage = {
  readonly stage: LeadRecord["stage"];
  readonly count: number;
  readonly estimatedValue: string;
  readonly leadIds: readonly string[];
};

export const dashboardSummary = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.auth.user.id;
  const [clients, activeProjects, openTickets, leads, exchanges] = await Promise.all([
    ctx.crmRepository.clients.list({ userId }),
    ctx.crmRepository.projects.list({ userId, status: "active" }),
    ctx.crmRepository.tickets.list({ userId, status: "open" }),
    ctx.crmRepository.leads.list({ userId }),
    ctx.crmRepository.exchanges.listTimeline({ userId }),
  ]);

  return {
    metrics: {
      activeClients: clients.length,
      activeProjects: activeProjects.length,
      openTickets: openTickets.length,
    },
    leadPipeline: summarizeLeadPipeline(leads),
    upcomingDeadlines: summarizeUpcomingDeadlines(activeProjects, openTickets),
    recentActivity: summarizeRecentActivity(exchanges),
  };
});

function summarizeLeadPipeline(leads: readonly LeadRecord[]): readonly DashboardPipelineStage[] {
  return LEAD_STAGES.map((stage) => {
    const stageLeads = leads.filter((lead) => lead.stage === stage);
    return {
      stage,
      count: stageLeads.length,
      estimatedValue: summarizeEstimatedValue(stageLeads),
      leadIds: stageLeads.map((lead) => lead.id),
    };
  }).filter((stage) => stage.count > 0);
}

function summarizeEstimatedValue(leads: readonly LeadRecord[]): string {
  const totalsByCurrency = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.estimatedValueAmount || !lead.estimatedValueCurrency) {
      continue;
    }
    const currentTotal = totalsByCurrency.get(lead.estimatedValueCurrency) ?? 0;
    totalsByCurrency.set(lead.estimatedValueCurrency, currentTotal + Number(lead.estimatedValueAmount));
  }

  const totals = Array.from(totalsByCurrency.entries()).map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`);
  return totals.length === 0 ? "No estimated value" : totals.join(" + ");
}

function summarizeUpcomingDeadlines(projects: readonly ProjectRecord[], tickets: readonly TicketRecord[]): readonly DashboardDeadline[] {
  const projectDeadlines = projects.flatMap((project) =>
    project.dueAt
      ? [
          {
            id: project.id,
            kind: "project" as const,
            title: project.name,
            dueAt: project.dueAt.toISOString(),
          },
        ]
      : [],
  );
  const ticketDeadlines = tickets.flatMap((ticket) =>
    ticket.dueAt
      ? [
          {
            id: ticket.id,
            kind: "ticket" as const,
            title: ticket.title,
            dueAt: ticket.dueAt.toISOString(),
          },
        ]
      : [],
  );

  return [...projectDeadlines, ...ticketDeadlines]
    .toSorted((left, right) => left.dueAt.localeCompare(right.dueAt))
    .slice(0, DASHBOARD_ITEM_LIMIT);
}

function summarizeRecentActivity(exchanges: readonly ExchangeRecord[]): readonly DashboardActivity[] {
  return exchanges
    .toSorted((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, DASHBOARD_ITEM_LIMIT)
    .map((exchange) => ({
      id: exchange.id,
      kind: exchange.type,
      title: exchange.subject ?? exchange.body,
      occurredAt: exchange.occurredAt.toISOString(),
    }));
}
