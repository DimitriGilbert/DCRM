import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, DeletedParentNotice, FormShell, ProjectForm } from "@/features/project-ticket/forms";
import type { ProjectMutationInput } from "@/features/project-ticket/forms";
import type { ClientOptionRecord, ProjectRecord } from "@/features/project-ticket/types";
import { ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/projects/$projectId/edit")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const clients = useQuery(trpc.clients.list.queryOptions({ includeDeleted: false }));
  const updateProject = useMutation(trpc.projects.update.mutationOptions());

  async function handleSubmit(input: ProjectMutationInput) {
    const updated = await updateProject.mutateAsync({ id: projectId, ...input });
    await queryClient.invalidateQueries();
    toast.success("Project updated", { description: `${updated.name} has been saved.` });
    await navigate({ to: "/projects/$projectId", params: { projectId } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Edit project" title={project.data?.name ?? "Edit project"} description="Update project details using the shared Formedible project schema." actions={<BackButton href={`/projects/${projectId}`} label="Back to project" />} />
      {project.isError || clients.isError ? <ErrorState title="Project could not load" /> : project.data && clients.data ? <ProjectEditContent project={project.data} clients={clients.data} submitting={updateProject.isPending} onSubmit={handleSubmit} /> : <LoadingCards />}
    </PageFrame>
  );
}

function ProjectEditContent({ project, clients, submitting, onSubmit }: { readonly project: ProjectRecord; readonly clients: readonly ClientOptionRecord[]; readonly submitting: boolean; readonly onSubmit: (input: ProjectMutationInput) => Promise<void> }) {
  const clientUnavailable = !clients.some((client) => client.id === project.clientId);

  return (
    <div className="space-y-4">
      {clientUnavailable ? <DeletedParentNotice title="Client needs attention" description="This project is attached to a deleted client. Choose an active client before saving so the project is not resubmitted with a deleted parent." /> : null}
      <FormShell title="Project details" description="Changes stay scoped to your single-user CRM account.">
        <ProjectForm project={project} clients={clients} clientUnavailable={clientUnavailable} submitLabel="Save project" submitting={submitting} onSubmit={onSubmit} />
      </FormShell>
    </div>
  );
}
