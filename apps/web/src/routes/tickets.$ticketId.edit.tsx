import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, FormShell, TicketForm } from "@/features/project-ticket/forms";
import type { TicketMutationInput } from "@/features/project-ticket/forms";
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
  const ticket = useQuery(trpc.tickets.get.queryOptions({ id: ticketId }));
  const projects = useQuery(trpc.projects.list.queryOptions({ includeDeleted: false }));
  const updateTicket = useMutation(trpc.tickets.update.mutationOptions());

  async function handleSubmit(input: TicketMutationInput) {
    const updated = await updateTicket.mutateAsync({ id: ticketId, ...input });
    await queryClient.invalidateQueries();
    toast.success("Ticket updated", { description: `${updated.title} has been saved.` });
    await navigate({ to: "/tickets/$ticketId", params: { ticketId } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Edit ticket" title={ticket.data?.title ?? "Edit ticket"} description="Update ticket details using the shared Formedible ticket schema." actions={<BackButton href={`/tickets/${ticketId}`} label="Back to ticket" />} />
      {ticket.isError || projects.isError ? <ErrorState title="Ticket could not load" /> : ticket.data && projects.data ? (
        <FormShell title="Ticket details" description="Changes stay scoped to your single-user CRM account.">
          <TicketForm ticket={ticket.data} projects={projects.data} submitLabel="Save ticket" submitting={updateTicket.isPending} onSubmit={handleSubmit} />
        </FormShell>
      ) : <LoadingCards />}
    </PageFrame>
  );
}
