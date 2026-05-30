import { Button } from "@DCRM/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { getUser } from "@/functions/get-user";
import { ProjectFilterForm } from "@/features/project-ticket/forms";
import type { ProjectFilterValues } from "@/features/project-ticket/forms";
import { ErrorState, LoadingCards, PageFrame, PageHeader, ProjectGrid } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/projects")({
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
  const [filters, setFilters] = useState<ProjectFilterValues>({ search: "", status: "all", includeDeleted: false });
  const projects = useQuery(trpc.projects.list.queryOptions({
    search: filters.search || undefined,
    status: filters.status === "all" ? undefined : filters.status,
    includeDeleted: filters.includeDeleted,
  }));

  return (
    <PageFrame>
      <PageHeader eyebrow="Projects" title="Project work" description="Track active client work, budgets, hours, and deadlines." actions={<Button render={<a href="/projects/new" />}>New project</Button>} />
      <ProjectFilterForm onSubmit={setFilters} />
      {projects.isError ? <ErrorState title="Projects could not load" /> : projects.data ? <ProjectGrid projects={projects.data} /> : <LoadingCards />}
    </PageFrame>
  );
}
