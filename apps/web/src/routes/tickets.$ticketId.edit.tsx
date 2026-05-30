import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, DeletedParentNotice, FormShell, TicketForm } from "@/features/project-ticket/forms";
import type { TicketMutationInput } from "@/features/project-ticket/forms";
import type { ProjectListRecord, TicketRecord } from "@/features/project-ticket/types";
import { ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/tickets/$ticketId/edit")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const { ticketId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ticket = useQuery(trpc.tickets.get.queryOptions({ id: ticketId, includeInactiveParent: true }));
  const projects = useQuery(trpc.projects.list.queryOptions({ includeDeleted: false }));
  const updateTicket = useMutation(trpc.tickets.update.mutationOptions());
  const projectUnavailable = ticket.data && projects.data ? !projects.data.some((project) => project.id === ticket.data.projectId) : false;

  async function handleSubmit(input: TicketMutationInput) {
    const updated = await updateTicket.mutateAsync({ id: ticketId, ...input });
    await queryClient.invalidateQueries();
    toast.success("Ticket updated", { description: `${updated.title} has been saved.` });
    await navigate({ to: "/tickets/$ticketId", params: { ticketId } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Edit ticket" title={ticket.data?.title ?? "Edit ticket"} description="Update ticket details using the shared Formedible ticket schema." actions={<BackButton href={projectUnavailable ? "/tickets" : `/tickets/${ticketId}`} label={projectUnavailable ? "Back to tickets" : "Back to ticket"} />} />
      {ticket.isError || projects.isError ? <ErrorState title="Ticket could not load" /> : ticket.data && projects.data ? <TicketEditContent ticket={ticket.data} projects={projects.data} submitting={updateTicket.isPending} onSubmit={handleSubmit} /> : <LoadingCards />}
    </PageFrame>
  );
}

function TicketEditContent({ ticket, projects, submitting, onSubmit }: { readonly ticket: TicketRecord; readonly projects: readonly ProjectListRecord[]; readonly submitting: boolean; readonly onSubmit: (input: TicketMutationInput) => Promise<void> }) {
  const projectUnavailable = !projects.some((project) => project.id === ticket.projectId);

  if (projectUnavailable) {
    return (
      <DeletedParentNotice title="Project needs attention" description="This ticket belongs to a deleted or inactive project. Ticket edits are locked until the parent project is active again, matching the API's active-parent requirement.">
        <BackButton href="/tickets" label="Back to tickets" />
      </DeletedParentNotice>
    );
  }

  return (
    <FormShell title="Ticket details" description="Changes stay scoped to your single-user CRM account.">
      <TicketForm ticket={ticket} projects={projects} projectUnavailable={projectUnavailable} submitLabel="Save ticket" submitting={submitting} onSubmit={onSubmit} />
    </FormShell>
  );
}
