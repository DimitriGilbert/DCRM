import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { ArrowRight, GripVertical, LockKeyhole, MessageSquareText, StickyNote } from "lucide-react";
import type { ReactNode } from "react";

import { formatLabel } from "./forms";
import { WEB_TICKET_STATUSES } from "./constants";
import type { WebTicketStatus } from "./constants";
import type { ExchangeTimelineRecord, ProjectListRecord, ProjectRecord, TicketListRecord, TicketRecord } from "./types";

export function PageFrame({ children }: { readonly children: ReactNode }) {
  return (
    <main className="overflow-auto bg-muted/20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { readonly eyebrow: string; readonly title: string; readonly description: string; readonly actions?: ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="space-y-2">
        <span className="inline-flex h-5 w-fit items-center border px-2 text-xs font-medium text-muted-foreground">{eyebrow}</span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions}
    </section>
  );
}

export function LoadingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading records">
      {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-44" />)}
    </div>
  );
}

export function EmptyState({ title, description, action }: { readonly title: string; readonly description: string; readonly action?: ReactNode }) {
  return (
    <div className="border border-dashed bg-background p-8 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title }: { readonly title: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Refresh the page or sign in again to reconnect to your CRM data.</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function ProjectGrid({ projects }: { readonly projects: readonly ProjectListRecord[] }) {
  if (projects.length === 0) {
    return <EmptyState title="No projects found" description="Create a project or adjust filters." action={<Button render={<a href="/projects/new" />}>New project</Button>} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardHeader>
            <CardTitle className="flex items-start justify-between gap-3">
              <span>{project.name}</span>
              <Badge variant="outline">{formatLabel(project.status)}</Badge>
            </CardTitle>
            <CardDescription>{project.description ?? "Client project"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-2 text-xs">
              <Row label="Budget" value={formatMoney(project.budgetAmount, project.budgetCurrency)} />
              <Row label="Hours" value={formatHours(project.estimatedHours, project.actualHours)} />
              <Row label="Due" value={project.dueAt ? formatDate(project.dueAt) : "—"} />
            </dl>
            <Button variant="outline" size="sm" render={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}>
              View project <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TicketGrid({ tickets }: { readonly tickets: readonly TicketListRecord[] }) {
  if (tickets.length === 0) {
    return <EmptyState title="No tickets found" description="Create a ticket or adjust filters." action={<Button render={<a href="/tickets/new" />}>New ticket</Button>} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
    </div>
  );
}

export function TicketCard({ ticket }: { readonly ticket: TicketListRecord | TicketRecord }) {
  return (
    <Card className={ticket.priority === "urgent" ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-3">
          <span>{ticket.title}</span>
          <Badge variant={ticket.status === "closed" ? "secondary" : "outline"}>{formatLabel(ticket.status)}</Badge>
        </CardTitle>
        <CardDescription>{ticket.description ?? formatLabel(ticket.type)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-xs">
          <Row label="Type" value={formatLabel(ticket.type)} />
          <Row label="Priority" value={formatLabel(ticket.priority)} />
          <Row label="Due" value={ticket.dueAt ? formatDate(ticket.dueAt) : "—"} />
        </dl>
        <Button variant="outline" size="sm" render={<Link to="/tickets/$ticketId" params={{ ticketId: ticket.id }} />}>
          View ticket <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}

export function ProjectDetails({ project }: { readonly project: ProjectRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{project.name}<Badge variant="outline">{formatLabel(project.status)}</Badge></CardTitle>
        <CardDescription>{project.description ?? "Project profile"}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Budget" value={formatMoney(project.budgetAmount, project.budgetCurrency)} />
          <Row label="Hours" value={formatHours(project.estimatedHours, project.actualHours)} />
          <Row label="Start" value={project.startsAt ? formatDate(project.startsAt) : "—"} />
          <Row label="Due" value={project.dueAt ? formatDate(project.dueAt) : "—"} />
          <Row label="Completed" value={project.completedAt ? formatDate(project.completedAt) : "—"} />
          <Row label="Created" value={formatDate(project.createdAt)} />
          <Row label="Description" value={project.description ?? "—"} wide />
        </dl>
      </CardContent>
    </Card>
  );
}

export function TicketDetails({ ticket }: { readonly ticket: TicketRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{ticket.title}<Badge variant="outline">{formatLabel(ticket.status)}</Badge></CardTitle>
        <CardDescription>{formatLabel(ticket.type)} · {formatLabel(ticket.priority)} priority</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Project" value={ticket.projectId} />
          <Row label="Due" value={ticket.dueAt ? formatDate(ticket.dueAt) : "—"} />
          <Row label="Closed" value={ticket.closedAt ? formatDate(ticket.closedAt) : "—"} />
          <Row label="Created" value={formatDate(ticket.createdAt)} />
          <Row label="Description" value={ticket.description ?? "—"} wide />
        </dl>
      </CardContent>
    </Card>
  );
}

export function TicketKanban({ tickets, onMove, movingTicketId }: { readonly tickets: readonly TicketListRecord[]; readonly onMove: (ticketId: string, status: WebTicketStatus) => void; readonly movingTicketId?: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {WEB_TICKET_STATUSES.map((status) => {
        const columnTickets = tickets.filter((ticket) => ticket.status === status);
        return (
          <Card key={status} className="min-h-80">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{formatLabel(status)}</span>
                <Badge variant="outline">{columnTickets.length}</Badge>
              </CardTitle>
              <CardDescription>{columnTickets.length} ticket{columnTickets.length === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {columnTickets.length > 0 ? columnTickets.map((ticket) => (
                <div key={ticket.id} className="border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground">{formatLabel(ticket.type)} · {formatLabel(ticket.priority)}</p>
                    </div>
                    <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="mt-3 grid gap-2">
                    <Button variant="outline" size="xs" render={<Link to="/tickets/$ticketId" params={{ ticketId: ticket.id }} />}>Open</Button>
                    {WEB_TICKET_STATUSES.filter((nextStatus) => nextStatus !== status).map((nextStatus) => (
                      <Button key={nextStatus} variant="ghost" size="xs" disabled={movingTicketId === ticket.id} onClick={() => onMove(ticket.id, nextStatus)}>
                        Move to {formatLabel(nextStatus)}
                      </Button>
                    ))}
                  </div>
                </div>
              )) : <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">No tickets in this status.</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ExchangeTimeline({ title, description, exchanges }: { readonly title: string; readonly description: string; readonly exchanges: readonly ExchangeTimelineRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {exchanges.length > 0 ? (
          <ol className="space-y-3" aria-label={title}>
            {exchanges.map((exchange) => <TimelineItem key={exchange.id} exchange={exchange} />)}
          </ol>
        ) : <EmptyState title="No timeline entries yet" description="Comments, notes, calls, meetings, and emails will appear here as exchanges." />}
      </CardContent>
    </Card>
  );
}

function TimelineItem({ exchange }: { readonly exchange: ExchangeTimelineRecord }) {
  const isInternalNote = exchange.type === "note";
  const isComment = exchange.type === "comment";
  const className = isInternalNote
    ? "border border-amber-300/40 bg-amber-500/10 p-4"
    : isComment
      ? "border border-sky-300/40 bg-sky-500/10 p-4"
      : "border bg-background p-4";

  return (
    <li className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {isInternalNote ? <StickyNote className="size-4 text-amber-500" aria-hidden="true" /> : isComment ? <MessageSquareText className="size-4 text-sky-500" aria-hidden="true" /> : null}
          <div>
            <p className="text-sm font-medium">{exchange.subject ?? formatLabel(exchange.type)}</p>
            <p className="text-xs text-muted-foreground">{formatDate(exchange.occurredAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatLabel(exchange.type)}</Badge>
          <Badge variant={exchange.visibility === "internal" ? "secondary" : "outline"}>{formatLabel(exchange.visibility)}</Badge>
          {isInternalNote ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><LockKeyhole className="size-3" aria-hidden="true" /> Never email-sendable</span> : null}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{exchange.body}</p>
    </li>
  );
}

function Row({ label, value, wide = false }: { readonly label: string; readonly value: string; readonly wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{value}</dd>
    </div>
  );
}

function formatMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  if (!amount) {
    return "—";
  }
  return currency ? `${amount} ${currency}` : amount;
}

function formatHours(estimated: string | null | undefined, actual: string | null | undefined): string {
  if (!estimated && !actual) {
    return "—";
  }
  return `${estimated ?? "—"} estimated / ${actual ?? "—"} actual`;
}

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
