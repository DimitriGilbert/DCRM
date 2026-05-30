import { Button } from "@DCRM/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, FormShell, InternalNoteForm } from "@/features/project-ticket/forms";
import type { InternalNoteMutationInput } from "@/features/project-ticket/forms";
import { ErrorState, ExchangeTimeline, LoadingCards, PageFrame, PageHeader, ProjectDetails, TicketGrid } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/projects/$projectId")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const tickets = useQuery(trpc.tickets.list.queryOptions({ projectId, includeDeleted: false }));
  const timeline = useQuery(trpc.exchanges.timeline.queryOptions({ projectId, includeDeleted: false }));
  const createExchange = useMutation(trpc.exchanges.create.mutationOptions());

  async function handleInternalNote(input: InternalNoteMutationInput) {
    if (!project.data) {
      return;
    }
    await createExchange.mutateAsync({ projectId, clientId: project.data.clientId, type: input.type, visibility: input.visibility, body: input.body });
    await queryClient.invalidateQueries();
    toast.success("Internal note added", { description: "The note is private and never email-sendable." });
  }

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Project detail"
        title={project.data?.name ?? "Project"}
        description="Review project state, related tickets, and the unified project exchange timeline."
        actions={<div className="flex flex-wrap gap-2"><BackButton href="/projects" label="Back" /><Button variant="outline" render={<a href="/tickets/new" />}>New ticket</Button><Button render={<a href={`/projects/${projectId}/edit`} />}>Edit project</Button></div>}
      />
      {project.isError ? <ErrorState title="Project could not load" /> : project.data ? <ProjectDetails project={project.data} /> : <LoadingCards />}
      {tickets.isError ? <ErrorState title="Project tickets could not load" /> : tickets.data ? <TicketGrid tickets={tickets.data} /> : <LoadingCards />}
      {timeline.isError ? <ErrorState title="Project timeline could not load" /> : timeline.data ? <ExchangeTimeline title="Project timeline" description="Unified exchanges for this project, including ticket context when linked." exchanges={timeline.data} /> : <LoadingCards />}
      {project.data ? (
        <FormShell title="Add internal project note" description="Notes are always internal-only timeline entries, not outbound messages.">
          <InternalNoteForm submitting={createExchange.isPending} onSubmit={handleInternalNote} />
        </FormShell>
      ) : null}
    </PageFrame>
  );
}
