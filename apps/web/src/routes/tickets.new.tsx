import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, FormShell, TicketForm } from "@/features/project-ticket/forms";
import type { TicketMutationInput } from "@/features/project-ticket/forms";
import { ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/tickets/new")({
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery(trpc.projects.list.queryOptions({ includeDeleted: false }));
  const createTicket = useMutation(trpc.tickets.create.mutationOptions());

  async function handleSubmit(input: TicketMutationInput) {
    const ticket = await createTicket.mutateAsync(input);
    await queryClient.invalidateQueries();
    toast.success("Ticket created", { description: `${ticket.title} is now in your queue.` });
    await navigate({ to: "/tickets/$ticketId", params: { ticketId: ticket.id } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="New ticket" title="Create a ticket" description="Track a task, issue, bug, feature request, or question inside a project." actions={<BackButton href="/tickets" label="Back to tickets" />} />
      {projects.isError ? <ErrorState title="Projects could not load" /> : projects.data ? (
        <FormShell title="Ticket details" description="Ticket create/edit forms use Formedible schemas.">
          <TicketForm projects={projects.data} submitLabel="Create ticket" submitting={createTicket.isPending} onSubmit={handleSubmit} />
        </FormShell>
      ) : <LoadingCards />}
    </PageFrame>
  );
}
