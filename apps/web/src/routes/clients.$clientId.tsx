import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, TagCreateForm } from "@/features/client-lead/forms";
import type { TagFormValues } from "@/features/client-lead/forms";
import { ClientDetails, EmptyState, ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/client-lead/views";
import { FormShell, InternalNoteForm } from "@/features/project-ticket/forms";
import type { InternalNoteMutationInput } from "@/features/project-ticket/forms";
import { ExchangeTimeline } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/clients/$clientId")({
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
  const client = useQuery(trpc.clients.get.queryOptions({ id: clientId }));
  const tags = useQuery(trpc.tags.list.queryOptions({ includeDeleted: false }));
  const entityTags = useQuery(trpc.tags.listEntity.queryOptions({ entityType: "client", entityId: clientId }));
  const timeline = useQuery(trpc.exchanges.timeline.queryOptions({ clientId, includeDeleted: false }));
  const createTag = useMutation(trpc.tags.create.mutationOptions());
  const attachTag = useMutation(trpc.tags.attach.mutationOptions());
  const detachTag = useMutation(trpc.tags.detach.mutationOptions());
  const createExchange = useMutation(trpc.exchanges.create.mutationOptions());

  async function refreshTags() {
    await queryClient.invalidateQueries();
  }

  async function handleCreateTag(values: TagFormValues) {
    const tag = await createTag.mutateAsync({ name: values.name.trim(), color: values.color.trim() || null });
    await attachTag.mutateAsync({ entityType: "client", entityId: clientId, tagId: tag.id });
    await refreshTags();
    toast.success("Tag created", { description: `${tag.name} was attached to this client.` });
  }

  async function handleAttach(tagId: string) {
    await attachTag.mutateAsync({ entityType: "client", entityId: clientId, tagId });
    await refreshTags();
    toast.success("Tag attached");
  }

  async function handleDetach(tagId: string) {
    await detachTag.mutateAsync({ entityType: "client", entityId: clientId, tagId });
    await refreshTags();
    toast.success("Tag detached");
  }

  async function handleInternalNote(input: InternalNoteMutationInput) {
    await createExchange.mutateAsync({ clientId, type: input.type, visibility: input.visibility, body: input.body });
    await queryClient.invalidateQueries();
    toast.success("Internal note added", { description: "The note is private and never email-sendable." });
  }

  const attachedTagIds = new Set(entityTags.data?.map((tag) => tag.tagId) ?? []);

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Client detail"
        title={client.data?.name ?? "Client"}
        description="Review the profile, maintain tags, and jump into edits."
        actions={<div className="flex gap-2"><BackButton href="/clients" label="Back" /><Button render={<a href={`/clients/${clientId}/edit`} />}>Edit client</Button></div>}
      />
      {client.isError ? <ErrorState title="Client could not load" /> : client.data ? <ClientDetails client={client.data} /> : <LoadingCards />}
      {timeline.isError ? <ErrorState title="Client timeline could not load" /> : timeline.data ? <ExchangeTimeline title="Client timeline" description="Unified exchanges across this client, including project and ticket context when linked." exchanges={timeline.data} /> : <LoadingCards />}
      {client.data ? (
        <FormShell title="Add internal client note" description="Notes are always internal-only timeline entries, not outbound messages.">
          <InternalNoteForm submitting={createExchange.isPending} onSubmit={handleInternalNote} />
        </FormShell>
      ) : null}
      {client.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <CardDescription>Client tag UI uses the current tag API support. Leads are not tagged until the API supports lead tags.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TagCreateForm submitting={createTag.isPending || attachTag.isPending} onSubmit={handleCreateTag} />
            {tags.data && tags.data.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tags.data.map((tag) => {
                  const attached = attachedTagIds.has(tag.id);
                  return (
                    <div key={tag.id} className="flex items-center justify-between gap-3 border bg-background p-3">
                      <span className="font-medium">{tag.name}</span>
                      <Button variant={attached ? "destructive" : "outline"} size="xs" disabled={attachTag.isPending || detachTag.isPending} onClick={() => attached ? handleDetach(tag.id) : handleAttach(tag.id)}>
                        {attached ? "Detach" : "Attach"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState title="No tags yet" description="Create the first client tag above." />}
          </CardContent>
        </Card>
      ) : null}
    </PageFrame>
  );
}
