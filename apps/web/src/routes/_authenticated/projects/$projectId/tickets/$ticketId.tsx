import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { Textarea } from "@DCRM/ui/components/textarea";

import { ExchangeTimeline } from "@/components/exchange-timeline";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_authenticated/projects/$projectId/tickets/$ticketId")({
  component: TicketDetailPage,
});

type TicketData = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly type: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: Date | null;
  readonly createdAt: Date | null;
  readonly projectId: string;
  readonly deletedAt: Date | null;
};

function TicketDetailPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { projectId, ticketId } = Route.useParams();

  const ticketQuery = useQuery(
    trpc.ticket.read.queryOptions({ id: ticketId }),
  );

  const projectQuery = useQuery(
    trpc.project.read.queryOptions(
      { id: projectId },
      { enabled: !!projectId },
    ),
  );

  const softDeleteMutation = useMutation(
    trpc.ticket.softDelete.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.ticket.list.queryFilter());
        if (data) {
          toast.success("Ticket deleted");
        } else {
          toast.error("Failed to delete ticket — record not found");
        }
        navigate({ to: "/projects/$projectId/tickets", params: { projectId } });
      },
      onError: (error) => {
        toast.error("Failed to delete ticket", {
          description: error.message,
        });
      },
    }),
  );

  if (ticketQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const ticket = ticketQuery.data as TicketData | null;

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Ticket not found.</p>
        <Link to="/projects/$projectId/tickets" params={{ projectId }} className="mt-3">
          <Button variant="outline" size="sm">Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  if (ticket.deletedAt) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">This ticket has been deleted.</p>
        <Link to="/projects/$projectId/tickets" params={{ projectId }} className="mt-3">
          <Button variant="outline" size="sm">Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  const projectName = projectQuery.data?.name ?? "Project";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="text-xs text-muted-foreground hover:underline"
          >
            {projectName}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            <TicketTypeIcon type={ticket.type} />
            <h2 className="truncate text-sm font-medium">{ticket.title}</h2>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/projects/$projectId/tickets/$ticketId/edit"
            params={{ projectId, ticketId }}
          >
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => softDeleteMutation.mutate({ id: ticket.id })}
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
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
            <DetailField label="Type" value={<TicketTypeBadge type={ticket.type} />} />
            <DetailField label="Status" value={<TicketStatusBadge status={ticket.status} />} />
            <DetailField label="Priority" value={<TicketPriorityBadge priority={ticket.priority} />} />
            {ticket.dueDate && (
              <DetailField label="Due Date" value={new Date(ticket.dueDate).toLocaleDateString()} />
            )}
            {ticket.createdAt && (
              <DetailField label="Created" value={new Date(ticket.createdAt).toLocaleDateString()} />
            )}
          </dl>
        </CardContent>
      </Card>

      {ticket.description && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              {ticket.description}
            </p>
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Add Comment / Note</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentForm projectId={projectId} ticketId={ticketId} />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ExchangeTimeline ticketId={ticketId} projectId={projectId} />
        </CardContent>
      </Card>
    </div>
  );
}

function CommentForm({ projectId, ticketId }: { readonly projectId: string; readonly ticketId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const createExchangeMutation = useMutation(
    trpc.exchange.create.mutationOptions({
      onSuccess: () => {
        toast.success(isInternal ? "Internal note added" : "Comment added");
        queryClient.invalidateQueries({
          queryKey: trpc.exchange.timeline.queryOptions({ ticketId, projectId, limit: 50 }).queryKey,
        });
        setBody("");
        setIsInternal(false);
      },
      onError: (error) => {
        toast.error("Failed to add comment", {
          description: error.message,
        });
      },
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    createExchangeMutation.mutate({
      type: isInternal ? "note" : "comment",
      projectId,
      ticketId,
      body,
      direction: "outgoing",
      isInternal,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        value={body}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        placeholder={isInternal ? "Add an internal note (never emailed)..." : "Add a comment..."}
        rows={3}
        className="text-xs"
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsInternal(e.target.checked)}
            className="rounded border-input"
          />
          Internal note (private, never emailed)
        </label>
        <Button
          type="submit"
          size="sm"
          disabled={!body.trim() || createExchangeMutation.isPending}
        >
          {isInternal ? "Add Note" : "Add Comment"}
        </Button>
      </div>
    </form>
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
    medium: "Medium",
    high: "High",
    urgent: "Urgent",
  };
  return (
    <Badge variant={variants[priority] ?? "outline"} className="text-[10px]">
      {labels[priority] ?? priority}
    </Badge>
  );
}

function TicketTypeBadge({ type }: { readonly type: string }) {
  const labels: Record<string, string> = {
    task: "Task",
    bug: "Bug",
    feature: "Feature",
    question: "Question",
  };
  return (
    <Badge variant="outline" className="text-[10px]">
      {labels[type] ?? type}
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
