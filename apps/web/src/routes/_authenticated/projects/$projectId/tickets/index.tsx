import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/projects/$projectId/tickets/")({
  component: TicketListPage,
});

type TicketItem = {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: string | null;
  readonly createdAt: string | null;
};

const STATUS_ORDER: Record<string, number> = {
  open: 0,
  in_progress: 1,
  resolved: 2,
  closed: 3,
};

function TicketListPage() {
  const trpc = useTRPC();
  const { projectId } = Route.useParams();
  const [view, setView] = useState<"list" | "kanban">("list");

  const projectQuery = useQuery(
    trpc.project.read.queryOptions({ id: projectId }),
  );

  const ticketsQuery = useQuery(
    trpc.ticket.list.queryOptions({ projectId, limit: 100 }),
  );

  if (projectQuery.isLoading || ticketsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const project = projectQuery.data;
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Link to="/projects" className="mt-3">
          <Button variant="outline" size="sm">Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const tickets = ticketsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="text-xs text-muted-foreground hover:underline"
          >
            {project.name}
          </Link>
          <h2 className="text-sm font-medium">Tickets</h2>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded border">
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              className="h-7 rounded-r-none px-2 text-xs"
              onClick={() => setView("list")}
            >
              List
            </Button>
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              className="h-7 rounded-l-none px-2 text-xs"
              onClick={() => setView("kanban")}
            >
              Kanban
            </Button>
          </div>
          <Link to="/projects/$projectId/tickets/create" params={{ projectId }}>
            <Button size="sm">New Ticket</Button>
          </Link>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No tickets yet.</p>
          <Link to="/projects/$projectId/tickets/create" params={{ projectId }}>
            <Button variant="outline" size="sm" className="mt-3">
              Create your first ticket
            </Button>
          </Link>
        </div>
      ) : view === "kanban" ? (
        <KanbanView tickets={tickets} projectId={projectId} />
      ) : (
        <ListView tickets={tickets} projectId={projectId} />
      )}
    </div>
  );
}

function ListView({ tickets, projectId }: { readonly tickets: readonly TicketItem[]; readonly projectId: string }) {
  return (
    <div className="space-y-1">
      {tickets.map((ticket) => (
        <Link
          key={ticket.id}
          to="/projects/$projectId/tickets/$ticketId"
          params={{ projectId, ticketId: ticket.id }}
          className="flex items-center justify-between rounded px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <TicketTypeIcon type={ticket.type} />
            <span className="truncate text-xs font-medium">{ticket.title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ticket.dueDate && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(ticket.dueDate).toLocaleDateString()}
              </span>
            )}
            <TicketPriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function KanbanView({ tickets, projectId }: { readonly tickets: readonly TicketItem[]; readonly projectId: string }) {
  const columns: Record<string, TicketItem[]> = {
    open: [],
    in_progress: [],
    resolved: [],
    closed: [],
  };

  for (const ticket of tickets) {
    const col = columns[ticket.status];
    if (col) {
      col.push(ticket);
    } else {
      columns["open"].push(ticket);
    }
  }

  const columnLabels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
  };

  return (
    <div className="grid grid-cols-4 gap-3">
      {Object.entries(columns).sort(([a], [b]) => (STATUS_ORDER[a] ?? 0) - (STATUS_ORDER[b] ?? 0)).map(([status, items]) => (
        <div key={status} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">
              {columnLabels[status]}
            </span>
            <span className="text-[10px] text-muted-foreground">{items.length}</span>
          </div>
          <div className="space-y-2">
            {items.map((ticket) => (
              <Link
                key={ticket.id}
                to="/projects/$projectId/tickets/$ticketId"
                params={{ projectId, ticketId: ticket.id }}
              >
                <Card size="sm" className="transition-colors hover:bg-muted/50">
                  <CardContent className="space-y-1 p-3">
                    <div className="flex items-start gap-1">
                      <TicketTypeIcon type={ticket.type} />
                      <span className="text-xs font-medium leading-tight">{ticket.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TicketPriorityBadge priority={ticket.priority} />
                      {ticket.dueDate && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(ticket.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TicketStatusBadge({ status }: { readonly status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    open: "outline",
    in_progress: "default",
    resolved: "secondary",
    closed: "secondary",
  };
  const labels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
  };
  return (
    <Badge variant={variants[status] ?? "outline"} className="text-[10px]">
      {labels[status] ?? status}
    </Badge>
  );
}

function TicketPriorityBadge({ priority }: { readonly priority: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    low: "outline",
    medium: "secondary",
    high: "default",
    urgent: "destructive",
  };
  const labels: Record<string, string> = {
    low: "Low",
    medium: "Med",
    high: "High",
    urgent: "Urgent",
  };
  return (
    <Badge variant={variants[priority] ?? "outline"} className="text-[10px]">
      {labels[priority] ?? priority}
    </Badge>
  );
}

function TicketTypeIcon({ type }: { readonly type: string }) {
  const icons: Record<string, string> = {
    task: "☐",
    bug: "🐛",
    feature: "✨",
    question: "❓",
  };
  return <span className="text-xs" aria-label={type}>{icons[type] ?? "☐"}</span>;
}
