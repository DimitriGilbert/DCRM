import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, FormShell, LeadForm } from "@/features/client-lead/forms";
import type { LeadMutationInput } from "@/features/client-lead/forms";
import { ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/leads/$leadId/edit")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const { leadId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lead = useQuery(trpc.leads.get.queryOptions({ id: leadId }));
  const updateLead = useMutation(trpc.leads.update.mutationOptions());

  async function handleSubmit(input: LeadMutationInput) {
    const updated = await updateLead.mutateAsync({ id: leadId, ...input });
    await queryClient.invalidateQueries();
    toast.success("Lead updated", { description: `${updated.name} has been saved.` });
    await navigate({ to: "/leads/$leadId", params: { leadId } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Edit lead" title={lead.data?.name ?? "Edit lead"} description="Update prospect details and pipeline fields using the shared Formedible lead schema." actions={<BackButton href={`/leads/${leadId}`} label="Back to lead" />} />
      {lead.isError ? <ErrorState title="Lead could not load" /> : lead.data ? (
        <FormShell title="Lead details" description="Fixed stages keep the solo pipeline predictable.">
          <LeadForm lead={lead.data} submitLabel="Save lead" submitting={updateLead.isPending} onSubmit={handleSubmit} />
        </FormShell>
      ) : <LoadingCards />}
    </PageFrame>
  );
}
