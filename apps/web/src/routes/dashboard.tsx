import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { ArrowRight, BriefcaseBusiness, CircleAlert, Handshake, Plus, UsersRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await getUser();
    return { session };
  },
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
      });
    }
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const trpc = useTRPC();
  const dashboardSummary = useQuery(trpc.dashboard.summary.queryOptions());

  return (
    <main className="overflow-auto bg-muted/20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <span className="inline-flex h-5 w-fit items-center border px-2 text-xs font-medium text-muted-foreground">Solo CRM dashboard</span>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {session?.user.name}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Track active relationships, open work, pipeline value, and recent client context from one place.
              </p>
            </div>
          </div>
          <QuickActions />
        </section>

        {dashboardSummary.isError ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle>Dashboard data could not load</CardTitle>
              <CardDescription>Refresh the page or sign in again to reconnect to your CRM data.</CardDescription>
            </CardHeader>
          </Card>
        ) : dashboardSummary.data ? (
          <div className="grid gap-6">
            <section aria-label="Dashboard metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Active clients" value={dashboardSummary.data.metrics.activeClients} icon={<UsersRound />} description="Relationships currently visible in your CRM" />
              <MetricCard title="Active projects" value={dashboardSummary.data.metrics.activeProjects} icon={<BriefcaseBusiness />} description="Projects in active delivery" />
              <MetricCard title="Open tickets" value={dashboardSummary.data.metrics.openTickets} icon={<CircleAlert />} description="Issues and tasks still open" />
              <MetricCard title="Pipeline stages" value={dashboardSummary.data.leadPipeline.length} icon={<Handshake />} description="Lead stages with current prospects" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Lead pipeline summary</CardTitle>
                  <CardDescription>Non-converted leads grouped by fixed DCRM pipeline stage.</CardDescription>
                </CardHeader>
                <CardContent>
                  {dashboardSummary.data.leadPipeline.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {dashboardSummary.data.leadPipeline.map((stage) => (
                        <div key={stage.stage} className="border bg-background p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium capitalize">{stage.stage.replace("_", " ")}</span>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center bg-secondary px-2 text-xs font-medium text-secondary-foreground">{stage.count}</span>
                          </div>
                          <p className="mt-3 text-lg font-semibold">{stage.estimatedValue}</p>
                          <p className="text-xs text-muted-foreground">{stage.leadIds.length} active lead{stage.leadIds.length === 1 ? "" : "s"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="No active leads yet" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Upcoming deadlines</CardTitle>
                  <CardDescription>Nearest due dates from active projects and open tickets.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TimelineList
                    emptyLabel="No upcoming deadlines"
                    items={dashboardSummary.data.upcomingDeadlines.map((deadline) => ({
                      id: `${deadline.kind}-${deadline.id}`,
                      title: deadline.title,
                      meta: `${deadline.kind} · ${formatDate(deadline.dueAt)}`,
                    }))}
                  />
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Latest exchanges across clients, projects, and tickets.</CardDescription>
              </CardHeader>
              <CardContent>
                <TimelineList
                  emptyLabel="No exchanges recorded yet"
                  items={dashboardSummary.data.recentActivity.map((activity) => ({
                    id: activity.id,
                    title: activity.title,
                    meta: `${activity.kind} · ${formatDate(activity.occurredAt)}`,
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <DashboardSkeleton />
        )}
      </div>
    </main>
  );
}

function QuickActions() {
  const actions = [
    { href: "/clients/new", label: "Client" },
    { href: "/leads/new", label: "Lead" },
    { href: "/projects/new", label: "Project" },
    { href: "/tickets/new", label: "Ticket" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Quick actions">
      {actions.map((action) => (
        <Button key={action.href} size="sm" variant="outline" render={<a href={action.href} />}>
          <Plus />
          New {action.label}
        </Button>
      ))}
    </div>
  );
}

function MetricCard({ title, value, description, icon }: { readonly title: string; readonly value: number; readonly description: string; readonly icon: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>{title}</CardDescription>
            <CardTitle className="text-3xl font-semibold">{value}</CardTitle>
          </div>
          <div className="grid size-9 place-items-center border bg-muted text-muted-foreground [&_svg]:size-4">{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function TimelineList({ items, emptyLabel }: { readonly items: readonly { readonly id: string; readonly title: string; readonly meta: string }[]; readonly emptyLabel: string }) {
  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="divide-y border">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-4 bg-background p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.meta}</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { readonly label: string }) {
  return <div className="border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">{label}</div>;
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6" aria-label="Loading dashboard">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
