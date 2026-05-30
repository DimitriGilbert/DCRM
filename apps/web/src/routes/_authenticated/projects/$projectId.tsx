import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";

import { ExchangeTimeline } from "@/components/exchange-timeline";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { projectId } = Route.useParams();

  const projectQuery = useQuery(
    trpc.project.read.queryOptions({ id: projectId }),
  );

  const clientQuery = useQuery(
    trpc.client.read.queryOptions(
      { id: projectQuery.data?.clientId ?? "" },
      { enabled: !!projectQuery.data?.clientId },
    ),
  );

  const ticketsQuery = useQuery(
    trpc.ticket.list.queryOptions(
      { projectId, limit: 50 },
      { enabled: !!projectQuery.data },
    ),
  );

  const softDeleteMutation = useMutation(
    trpc.project.softDelete.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.project.list.queryFilter());
        if (data) {
          toast.success("Project deleted");
        } else {
          toast.error("Failed to delete project — record not found");
        }
        navigate({ to: "/projects" });
      },
      onError: (error) => {
        toast.error("Failed to delete project", {
          description: error.message,
        });
      },
    }),
  );

  if (projectQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
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

  if (project.deletedAt) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">This project has been deleted.</p>
        <Link to="/projects" className="mt-3">
          <Button variant="outline" size="sm">Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const clientName = clientQuery.data?.name ?? "Unknown client";
  const tickets = ticketsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{project.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Link
              to="/clients/$clientId"
              params={{ clientId: project.clientId }}
              className="text-xs text-muted-foreground hover:underline"
            >
              {clientName}
            </Link>
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/projects/$projectId/edit"
            params={{ projectId: project.id }}
          >
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => softDeleteMutation.mutate({ id: project.id })}
            disabled={softDeleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <DetailField label="Status" value={<ProjectStatusBadge status={project.status} />} />
            <DetailField label="Budget" value={formatBudget(project.budgetAmount, project.budgetCurrency)} />
            <DetailField label="Estimated Hours" value={project.estimatedHours != null ? String(project.estimatedHours) : undefined} />
            <DetailField label="Start Date" value={formatDate(project.startDate)} />
            <DetailField label="End Date" value={formatDate(project.endDate)} />
          </dl>
        </CardContent>
      </Card>

      {project.description && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {project.description}
            </p>
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Tickets</CardTitle>
          <Link to="/projects/$projectId/tickets/create" params={{ projectId }}>
            <Button variant="outline" size="sm">New Ticket</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {ticketsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No tickets yet.</p>
          ) : (
            <div className="space-y-1">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to="/projects/$projectId/tickets/$ticketId"
                  params={{ projectId, ticketId: ticket.id }}
                  className="flex items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TicketTypeIcon type={ticket.type} />
                    <span className="truncate text-xs">{ticket.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TicketPriorityBadge priority={ticket.priority} />
                    <TicketStatusBadge status={ticket.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ExchangeTimeline projectId={projectId} />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-xs">{value}</dd>
    </div>
  );
}

function ProjectStatusBadge({ status }: { readonly status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    planning: "outline",
    active: "default",
    on_hold: "secondary",
    completed: "secondary",
    archived: "outline",
  };
  const labels: Record<string, string> = {
    planning: "Planning",
    active: "Active",
    on_hold: "On Hold",
    completed: "Completed",
    archived: "Archived",
  };
  return (
    <Badge variant={variants[status] ?? "outline"} className="text-[10px]">
      {labels[status] ?? status}
    </Badge>
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

function formatBudget(amount: number | null, currency: string | null): string | undefined {
  if (amount == null) return undefined;
  return `${currency ?? "USD"} ${amount.toLocaleString()}`;
}

function formatDate(date: string | null): string | undefined {
  if (!date) return undefined;
  return new Date(date).toLocaleDateString();
}
