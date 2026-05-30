import { Button } from "@DCRM/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { getUser } from "@/functions/get-user";
import { ClientFilterForm } from "@/features/client-lead/forms";
import type { ClientFilterValues } from "@/features/client-lead/forms";
import { ClientGrid, ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/clients")({
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
  const [filters, setFilters] = useState<ClientFilterValues>({ search: "", includeDeleted: false });
  const clients = useQuery(trpc.clients.list.queryOptions({ search: filters.search || undefined, includeDeleted: filters.includeDeleted }));

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Clients"
        title="Client relationships"
        description="Search, filter, tag, and maintain the client profiles that anchor your work."
        actions={<Button render={<a href="/clients/new" />}>New client</Button>}
      />
      <ClientFilterForm onSubmit={setFilters} />
      {clients.isError ? <ErrorState title="Clients could not load" /> : clients.data ? <ClientGrid clients={clients.data} /> : <LoadingCards />}
    </PageFrame>
  );
}
