import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, ConversionForm, FormShell } from "@/features/client-lead/forms";
import { EmptyState, ErrorState, LeadDetails, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/leads/$leadId/convert")({
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
  const convertLead = useMutation(trpc.leads.convert.mutationOptions());

  async function handleConvert() {
    const result = await convertLead.mutateAsync({ id: leadId });
    await queryClient.invalidateQueries();
    toast.success("Lead converted", { description: `${result.client.name} is now a client.` });
    await navigate({ to: "/clients/$clientId", params: { clientId: result.client.id } });
  }

  const conversionBlocked = lead.data && (lead.data.stage !== "won" || Boolean(lead.data.convertedAt));

  return (
    <PageFrame>
      <PageHeader eyebrow="Lead conversion" title="Convert lead to client" description="Conversion is an explicit Formedible confirmation that preserves lead history and creates a client." actions={<BackButton href={`/leads/${leadId}`} label="Back to lead" />} />
      {lead.isError ? <ErrorState title="Lead could not load" /> : lead.data ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <LeadDetails lead={lead.data} />
          {conversionBlocked ? (
            <EmptyState title="Lead cannot be converted" description="Only unconverted leads in the won stage can be converted into clients." />
          ) : (
            <FormShell title="Confirm conversion" description="The API will create a client and mark this lead as converted.">
              <ConversionForm lead={lead.data} submitting={convertLead.isPending} onSubmit={handleConvert} />
            </FormShell>
          )}
        </div>
      ) : <LoadingCards />}
    </PageFrame>
  );
}
