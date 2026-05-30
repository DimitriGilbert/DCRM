import { Button } from "@DCRM/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { getUser } from "@/functions/get-user";
import { LeadFilterForm } from "@/features/client-lead/forms";
import type { LeadFilterValues } from "@/features/client-lead/forms";
import { ErrorState, LeadGrid, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/leads")({
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
  const [filters, setFilters] = useState<LeadFilterValues>({ search: "", stage: "all", includeConverted: false, includeDeleted: false });
  const leads = useQuery(trpc.leads.list.queryOptions({
    search: filters.search || undefined,
    stage: filters.stage === "all" ? undefined : filters.stage,
    includeConverted: filters.includeConverted,
    includeDeleted: filters.includeDeleted,
  }));

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Leads"
        title="Prospecting pipeline"
        description="Search and filter prospects before they become clients."
        actions={<div className="flex gap-2"><Button variant="outline" render={<a href="/leads/kanban" />}>Kanban</Button><Button render={<a href="/leads/new" />}>New lead</Button></div>}
      />
      <LeadFilterForm onSubmit={setFilters} />
      {leads.isError ? <ErrorState title="Leads could not load" /> : leads.data ? <LeadGrid leads={leads.data} /> : <LoadingCards />}
    </PageFrame>
  );
}
