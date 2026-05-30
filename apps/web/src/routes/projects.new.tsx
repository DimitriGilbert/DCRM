import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { BackButton, FormShell, ProjectForm } from "@/features/project-ticket/forms";
import type { ProjectMutationInput } from "@/features/project-ticket/forms";
import { ErrorState, LoadingCards, PageFrame, PageHeader } from "@/features/project-ticket/views";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/projects/new")({
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
  const clients = useQuery(trpc.clients.list.queryOptions({ includeDeleted: false }));
  const createProject = useMutation(trpc.projects.create.mutationOptions());

  async function handleSubmit(input: ProjectMutationInput) {
    const project = await createProject.mutateAsync(input);
    await queryClient.invalidateQueries();
    toast.success("Project created", { description: `${project.name} is ready for tickets and exchanges.` });
    await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="New project" title="Create a project" description="Tie work to a client and capture budget, time, and deadline expectations." actions={<BackButton href="/projects" label="Back to projects" />} />
      {clients.isError ? <ErrorState title="Clients could not load" /> : clients.data ? (
        <FormShell title="Project details" description="Project create/edit forms use Formedible schemas.">
          <ProjectForm clients={clients.data} submitLabel="Create project" submitting={createProject.isPending} onSubmit={handleSubmit} />
        </FormShell>
      ) : <LoadingCards />}
    </PageFrame>
  );
}
