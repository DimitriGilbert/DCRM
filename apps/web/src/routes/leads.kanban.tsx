import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton } from "@/features/client-lead/forms";
import type { WebLeadStage } from "@/features/client-lead/constants";
import { ErrorState, LeadKanban, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/leads/kanban")({
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
  const pipeline = useQuery(trpc.leads.pipeline.queryOptions({ includeConverted: false, includeDeleted: false }));
  const updateStage = useMutation(trpc.leads.updateStage.mutationOptions());
  const [movingLeadId, setMovingLeadId] = useState<string | undefined>(undefined);

  async function handleMove(leadId: string, stage: WebLeadStage) {
    setMovingLeadId(leadId);
    try {
      const lead = await updateStage.mutateAsync({ id: leadId, stage });
      await queryClient.invalidateQueries();
      toast.success("Lead moved", { description: `${lead.name} is now ${stage}.` });
    } finally {
      setMovingLeadId(undefined);
    }
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Lead kanban" title="Move leads through stages" description="Use explicit stage buttons to keep the pipeline simple and predictable." actions={<BackButton href="/leads" label="Back to leads" />} />
      {pipeline.isError ? <ErrorState title="Lead pipeline could not load" /> : pipeline.data ? <LeadKanban pipeline={pipeline.data} onMove={handleMove} movingLeadId={movingLeadId} /> : <LoadingCards />}
    </PageFrame>
  );
}
