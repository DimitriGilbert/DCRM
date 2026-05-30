import { Button } from "@DCRM/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";
import { BackButton } from "@/features/client-lead/forms";
import { ErrorState, LeadDetails, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/leads/$leadId")({
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
  const lead = useQuery(trpc.leads.get.queryOptions({ id: leadId }));
  const canConvert = lead.data?.stage === "won" && !lead.data.convertedAt;

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Lead detail"
        title={lead.data?.name ?? "Lead"}
        description="Review prospect context, edit pipeline details, or explicitly convert a won lead."
        actions={<div className="flex flex-wrap gap-2"><BackButton href="/leads" label="Back" /><Button variant="outline" render={<a href={`/leads/${leadId}/edit`} />}>Edit lead</Button>{canConvert ? <Button render={<a href={`/leads/${leadId}/convert`} />}>Convert to client</Button> : null}</div>}
      />
      {lead.isError ? <ErrorState title="Lead could not load" /> : lead.data ? <LeadDetails lead={lead.data} /> : <LoadingCards />}
    </PageFrame>
  );
}
