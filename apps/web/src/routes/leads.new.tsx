import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, FormShell, LeadForm } from "@/features/client-lead/forms";
import type { LeadMutationInput } from "@/features/client-lead/forms";
import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/leads/new")({
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
  const createLead = useMutation(trpc.leads.create.mutationOptions());

  async function handleSubmit(input: LeadMutationInput) {
    const lead = await createLead.mutateAsync(input);
    await queryClient.invalidateQueries();
    toast.success("Lead created", { description: `${lead.name} entered the pipeline.` });
    await navigate({ to: "/leads/$leadId", params: { leadId: lead.id } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="New lead" title="Create a lead" description="Capture prospect details and place the lead in the fixed DCRM pipeline." actions={<BackButton href="/leads" label="Back to leads" />} />
      <FormShell title="Lead details" description="This create flow is schema-driven with Formedible.">
        <LeadForm submitLabel="Create lead" submitting={createLead.isPending} onSubmit={handleSubmit} />
      </FormShell>
    </PageFrame>
  );
}
