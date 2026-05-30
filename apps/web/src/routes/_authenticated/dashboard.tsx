import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const PIPELINE_STAGES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "negotiation", label: "Negotiation" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
] as const;

function buildLeadPipelineCounts(
  leads: Array<{ stage: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) {
    counts[stage.key] = 0;
  }
  for (const lead of leads) {
    const stageKey = lead.stage;
    if (stageKey in counts) {
      counts[stageKey]! += 1;
    }
  }
  return counts;
}

function buildPipelineTotalValue(
  leads: Array<{ estimatedValue: number | null; stage: string }>,
): number {
  return leads
    .filter((l) => l.stage !== "won" && l.stage !== "lost")
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
}

function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 1) return "1 day overdue";
    return `${absDays} days overdue`;
  }
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ${diffDays % 7}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(date: Date | string): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getTime() < Date.now();
}

function isUrgent(date: Date | string): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffDays = Math.ceil(
    (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  return diffDays >= 0 && diffDays <= 2;
}

function DashboardPage() {
  const trpc = useTRPC();

  const clientsQuery = useQuery(
    trpc.client.list.queryOptions({ limit: 100 }),
  );
  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({ limit: 100, status: "active" }),
  );
  const ticketsQuery = useQuery(
    trpc.ticket.list.queryOptions({ limit: 100, status: "open" }),
  );
  const leadsQuery = useQuery(
    trpc.lead.list.queryOptions({ limit: 100 }),
  );
  const recentExchangesQuery = useQuery(
    trpc.exchange.list.queryOptions({ limit: 5 }),
  );
  const ticketDeadlinesQuery = useQuery(
    trpc.ticket.upcomingDeadlines.queryOptions(),
  );
  const projectDeadlinesQuery = useQuery(
    trpc.project.upcomingDeadlines.queryOptions(),
  );

  const activeClientsCount = clientsQuery.data?.items.length ?? 0;
  const hasMoreClients = !!clientsQuery.data?.nextCursor;
  const activeProjectsCount = projectsQuery.data?.items.length ?? 0;
  const hasMoreProjects = !!projectsQuery.data?.nextCursor;
  const openTicketsCount = ticketsQuery.data?.items.length ?? 0;
  const hasMoreTickets = !!ticketsQuery.data?.nextCursor;

  const leads = leadsQuery.data?.items ?? [];
  const leadPipelineCounts = buildLeadPipelineCounts(leads);
  const pipelineTotalValue = buildPipelineTotalValue(leads);

  const recentExchanges = recentExchangesQuery.data?.items ?? [];

  const deadlinesLoading =
    ticketDeadlinesQuery.isLoading || projectDeadlinesQuery.isLoading;

  const allDeadlines = [
    ...(ticketDeadlinesQuery.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      date: t.dueDate!,
      kind: "ticket" as const,
      status: t.status,
      priority: t.priority,
    })),
    ...(projectDeadlinesQuery.data ?? []).map((p) => ({
      id: p.id,
      title: p.name,
      date: p.endDate!,
      kind: "project" as const,
      status: p.status,
      priority: null,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const isLoading =
    clientsQuery.isLoading ||
    projectsQuery.isLoading ||
    ticketsQuery.isLoading ||
    leadsQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Active Clients"
          value={activeClientsCount}
          hasMore={hasMoreClients}
          isLoading={isLoading}
        />
        <StatCard
          label="Active Projects"
          value={activeProjectsCount}
          hasMore={hasMoreProjects}
          isLoading={isLoading}
        />
        <StatCard
          label="Open Tickets"
          value={openTicketsCount}
          hasMore={hasMoreTickets}
          isLoading={isLoading}
        />
      </div>

      {/* Lead pipeline */}
      <LeadPipelineWidget
        counts={leadPipelineCounts}
        totalValue={pipelineTotalValue}
        isLoading={leadsQuery.isLoading}
      />

      {/* Quick actions */}
      <QuickActions />

      {/* Bottom row: Upcoming Deadlines + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <UpcomingDeadlines
          deadlines={allDeadlines}
          isLoading={deadlinesLoading}
        />
        <RecentActivity
          exchanges={recentExchanges}
          isLoading={recentExchangesQuery.isLoading}
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  hasMore: boolean;
  isLoading: boolean;
}

function StatCard({ label, value, hasMore, isLoading }: StatCardProps) {
  return (
    <div className="rounded-sm border bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {isLoading ? (
        <div className="mt-2 h-8 w-16 animate-pulse bg-muted" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {value}{hasMore ? "+" : ""}
        </p>
      )}
    </div>
  );
}

interface LeadPipelineProps {
  counts: Record<string, number>;
  totalValue: number;
  isLoading: boolean;
}

function LeadPipelineWidget({ counts, totalValue, isLoading }: LeadPipelineProps) {
  return (
    <div className="rounded-sm border bg-card p-4 ring-1 ring-foreground/10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Lead Pipeline</h2>
        {!isLoading && (
          <p className="text-xs text-muted-foreground">
            Pipeline value:{" "}
            <span className="font-medium text-foreground">
              $
              {totalValue.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        )}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-7 gap-2">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage.key} className="space-y-2">
              <div className="h-4 w-full animate-pulse bg-muted" />
              <div className="h-8 w-full animate-pulse bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {PIPELINE_STAGES.map((stage) => {
            const count = counts[stage.key] ?? 0;
            return (
              <div key={stage.key} className="text-center">
                <p className="text-[10px] text-muted-foreground">
                  {stage.label}
                </p>
                <p className="text-lg font-semibold tabular-nums">{count}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="rounded-sm border bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="mb-3 text-sm font-medium">Quick Actions</h2>
      <div className="flex flex-wrap gap-2">
        <ActionLink to="/clients" label="New Client" />
        <ActionLink to="/leads" label="New Lead" />
        <ActionLink to="/projects" label="New Project" />
        <ActionLink to="/tickets" label="New Ticket" />
      </div>
    </div>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center rounded-sm border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      + {label}
    </Link>
  );
}

interface ExchangeItem {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  createdAt: string | null;
}

interface RecentActivityProps {
  exchanges: ExchangeItem[];
  isLoading: boolean;
}

function RecentActivity({ exchanges, isLoading }: RecentActivityProps) {
  return (
    <div className="rounded-sm border bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="mb-3 text-sm font-medium">Recent Activity</h2>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse bg-muted" />
          ))}
        </div>
      ) : exchanges.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recent activity.</p>
      ) : (
        <div className="space-y-2">
          {exchanges.map((exchange) => (
            <div
              key={exchange.id}
              className="flex items-start justify-between gap-3 rounded-sm border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {exchange.subject ?? exchange.type}
                </p>
                {exchange.body && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {exchange.body}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {exchange.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DeadlineItem {
  id: string;
  title: string;
  date: Date | string;
  kind: "ticket" | "project";
  status: string;
  priority: string | null;
}

interface UpcomingDeadlinesProps {
  deadlines: DeadlineItem[];
  isLoading: boolean;
}

function UpcomingDeadlines({ deadlines, isLoading }: UpcomingDeadlinesProps) {
  return (
    <div className="rounded-sm border bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="mb-3 text-sm font-medium">Upcoming Deadlines</h2>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse bg-muted" />
          ))}
        </div>
      ) : deadlines.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No upcoming deadlines.
        </p>
      ) : (
        <div className="space-y-2">
          {deadlines.map((deadline) => {
            const overdue = isOverdue(deadline.date);
            const urgent = !overdue && isUrgent(deadline.date);
            return (
              <div
                key={`${deadline.kind}-${deadline.id}`}
                className="flex items-center justify-between gap-3 rounded-sm border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {deadline.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {deadline.kind === "ticket" ? "Ticket" : "Project"}
                    {deadline.priority ? ` · ${deadline.priority}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
                    overdue
                      ? "bg-destructive/15 text-destructive"
                      : urgent
                        ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {formatRelativeDate(deadline.date)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
