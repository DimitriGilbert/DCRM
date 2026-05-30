import { Button } from "@DCRM/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { getUser } from "@/functions/get-user";
import { TicketFilterForm } from "@/features/project-ticket/forms";
import type { TicketFilterValues } from "@/features/project-ticket/forms";
import { ErrorState, LoadingCards, PageFrame, PageHeader, TicketGrid } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/tickets")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const trpc = useTRPC();
  const [filters, setFilters] = useState<TicketFilterValues>({ search: "", status: "all", priority: "all", type: "all", includeDeleted: false });
  const tickets = useQuery(trpc.tickets.list.queryOptions({
    search: filters.search || undefined,
    status: filters.status === "all" ? undefined : filters.status,
    priority: filters.priority === "all" ? undefined : filters.priority,
    type: filters.type === "all" ? undefined : filters.type,
    includeDeleted: filters.includeDeleted,
  }));

  return (
    <PageFrame>
      <PageHeader eyebrow="Tickets" title="Ticket work queue" description="Track project tasks, bugs, feature requests, and questions." actions={<div className="flex gap-2"><Button variant="outline" render={<a href="/tickets/kanban" />}>Kanban</Button><Button render={<a href="/tickets/new" />}>New ticket</Button></div>} />
      <TicketFilterForm onSubmit={setFilters} />
      {tickets.isError ? <ErrorState title="Tickets could not load" /> : tickets.data ? <TicketGrid tickets={tickets.data} /> : <LoadingCards />}
    </PageFrame>
  );
}
