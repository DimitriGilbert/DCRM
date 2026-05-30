import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, ClientForm, FormShell } from "@/features/client-lead/forms";
import type { ClientMutationInput } from "@/features/client-lead/forms";
import { ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/clients/$clientId/edit")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const { clientId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const client = useQuery(trpc.clients.get.queryOptions({ id: clientId }));
  const updateClient = useMutation(trpc.clients.update.mutationOptions());

  async function handleSubmit(input: ClientMutationInput) {
    const updated = await updateClient.mutateAsync({ id: clientId, ...input });
    await queryClient.invalidateQueries();
    toast.success("Client updated", { description: `${updated.name} has been saved.` });
    await navigate({ to: "/clients/$clientId", params: { clientId } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Edit client" title={client.data?.name ?? "Edit client"} description="Update client profile details using the shared Formedible client schema." actions={<BackButton href={`/clients/${clientId}`} label="Back to client" />} />
      {client.isError ? <ErrorState title="Client could not load" /> : client.data ? (
        <FormShell title="Client details" description="Changes stay scoped to your single-user CRM account.">
          <ClientForm client={client.data} submitLabel="Save client" submitting={updateClient.isPending} onSubmit={handleSubmit} />
        </FormShell>
      ) : <LoadingCards />}
    </PageFrame>
  );
}
