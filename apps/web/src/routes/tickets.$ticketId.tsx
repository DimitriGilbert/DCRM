import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, InternalNoteForm, TicketCommentForm } from "@/features/project-ticket/forms";
import type { InternalNoteMutationInput, TicketCommentMutationInput } from "@/features/project-ticket/forms";
import { ErrorState, ExchangeTimeline, LoadingCards, PageFrame, PageHeader, TicketDetails } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/tickets/$ticketId")({
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
  const ticket = useQuery(trpc.tickets.get.queryOptions({ id: ticketId }));
  const timeline = useQuery(trpc.exchanges.timeline.queryOptions({ ticketId, includeDeleted: false }));
  const addComment = useMutation(trpc.exchanges.addTicketComment.mutationOptions());
  const createExchange = useMutation(trpc.exchanges.create.mutationOptions());

  async function handleComment(input: TicketCommentMutationInput) {
    const exchange = await addComment.mutateAsync({ ticketId, body: input.body, visibility: input.visibility });
    await queryClient.invalidateQueries();
    toast.success("Ticket comment added", { description: exchange.visibility === "external" ? "Stored as external-visible context; no email was sent." : "Stored as an internal ticket comment." });
  }

  async function handleInternalNote(input: InternalNoteMutationInput) {
    if (!ticket.data) {
      return;
    }
    await createExchange.mutateAsync({ ticketId, projectId: ticket.data.projectId, type: input.type, visibility: input.visibility, body: input.body });
    await queryClient.invalidateQueries();
    toast.success("Internal note added", { description: "The note is private and never email-sendable." });
  }

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Ticket detail"
        title={ticket.data?.title ?? "Ticket"}
        description="Review ticket state and keep comments distinct from internal-only notes."
        actions={<div className="flex flex-wrap gap-2"><BackButton href="/tickets" label="Back" /><Button render={<a href={`/tickets/${ticketId}/edit`} />}>Edit ticket</Button></div>}
      />
      {ticket.isError ? <ErrorState title="Ticket could not load" /> : ticket.data ? <TicketDetails ticket={ticket.data} /> : <LoadingCards />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-sky-300/40 bg-sky-500/5">
          <CardHeader>
            <CardTitle>Ticket comment</CardTitle>
            <CardDescription>Comments are conversation-style exchanges and can be marked external-visible. This phase does not send email.</CardDescription>
          </CardHeader>
          <CardContent>
            <TicketCommentForm submitting={addComment.isPending} onSubmit={handleComment} />
          </CardContent>
        </Card>
        <Card className="border-amber-300/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle>Internal note</CardTitle>
            <CardDescription>Notes are private working context and are never presented as email-sendable.</CardDescription>
          </CardHeader>
          <CardContent>
            <InternalNoteForm submitting={createExchange.isPending} onSubmit={handleInternalNote} />
          </CardContent>
        </Card>
      </div>
      {timeline.isError ? <ErrorState title="Ticket timeline could not load" /> : timeline.data ? <ExchangeTimeline title="Ticket timeline" description="Unified exchanges linked directly to this ticket." exchanges={timeline.data} /> : <LoadingCards />}
    </PageFrame>
  );
}
