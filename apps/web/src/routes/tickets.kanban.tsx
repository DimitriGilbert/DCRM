import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton } from "@/features/project-ticket/forms";
import type { WebTicketStatus } from "@/features/project-ticket/constants";
import { ErrorState, LoadingCards, PageFrame, PageHeader, TicketKanban } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/tickets/kanban")({
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
  const tickets = useQuery(trpc.tickets.list.queryOptions({ includeDeleted: false }));
  const updateStatus = useMutation(trpc.tickets.updateStatus.mutationOptions());
  const [movingTicketId, setMovingTicketId] = useState<string | undefined>(undefined);

  async function handleMove(ticketId: string, status: WebTicketStatus) {
    setMovingTicketId(ticketId);
    try {
      const ticket = await updateStatus.mutateAsync({ id: ticketId, status });
      await queryClient.invalidateQueries();
      toast.success("Ticket moved", { description: `${ticket.title} is now ${status}.` });
    } finally {
      setMovingTicketId(undefined);
    }
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Ticket kanban" title="Move tickets by status" description="Use explicit status buttons to keep ticket state predictable." actions={<BackButton href="/tickets" label="Back to tickets" />} />
      {tickets.isError ? <ErrorState title="Ticket board could not load" /> : tickets.data ? <TicketKanban tickets={tickets.data} onMove={handleMove} movingTicketId={movingTicketId} /> : <LoadingCards />}
    </PageFrame>
  );
}
