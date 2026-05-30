import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, ClientForm, FormShell } from "@/features/client-lead/forms";
import type { ClientMutationInput } from "@/features/client-lead/forms";
import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/clients/new")({
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
  const createClient = useMutation(trpc.clients.create.mutationOptions());

  async function handleSubmit(input: ClientMutationInput) {
    const client = await createClient.mutateAsync(input);
    await queryClient.invalidateQueries();
    toast.success("Client created", { description: `${client.name} is now in your CRM.` });
    await navigate({ to: "/clients/$clientId", params: { clientId: client.id } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="New client" title="Create a client" description="Capture the relationship details you need before projects and exchanges arrive." actions={<BackButton href="/clients" label="Back to clients" />} />
      <FormShell title="Client details" description="All application create/edit forms in DCRM use Formedible schemas.">
        <ClientForm submitLabel="Create client" submitting={createClient.isPending} onSubmit={handleSubmit} />
      </FormShell>
    </PageFrame>
  );
}
