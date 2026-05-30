import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

import { useTRPC } from "@/utils/trpc";
import { projectFormSchema, projectFormFields } from "@/lib/forms/project-form-schema";
import type { ProjectFormValues } from "@/lib/forms/project-form-schema";

export const Route = createFileRoute("/_authenticated/projects/$projectId/edit")({
  component: EditProjectPage,
});

function EditProjectPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { projectId } = Route.useParams();

  const projectQuery = useQuery(
    trpc.project.read.queryOptions({ id: projectId }),
  );

  const clientsQuery = useQuery(
    trpc.client.list.queryOptions({ limit: 100 }),
  );

  const updateMutation = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: () => {
        toast.success("Project updated");
        queryClient.invalidateQueries(trpc.project.list.queryFilter());
        queryClient.invalidateQueries(trpc.project.read.queryFilter({ id: projectId }));
        navigate({ to: "/projects/$projectId", params: { projectId } });
      },
      onError: (error) => {
        toast.error("Failed to update project", {
          description: error.message,
        });
      },
    }),
  );

  if (projectQuery.isLoading || clientsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const project = projectQuery.data;

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const defaultValues: ProjectFormValues = {
    name: project.name ?? "",
    clientId: project.clientId ?? "",
    description: project.description ?? "",
    status: project.status as ProjectFormValues["status"],
    budgetAmount: project.budgetAmount ?? undefined,
    budgetCurrency: project.budgetCurrency ?? "USD",
    estimatedHours: project.estimatedHours ?? undefined,
    startDate: project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "",
    endDate: project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : "",
  };

  const enrichedFields = projectFormFields.map((f) => {
    if (f.name === "clientId") {
      return {
        ...f,
        options: (clientsQuery.data?.items ?? []).map((c) => ({
          value: c.id,
          label: c.name,
        })),
      };
    }
    return f;
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Edit Project</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/projects/$projectId", params: { projectId } })}
        >
          Cancel
        </Button>
      </div>
      <EditProjectForm
        defaultValues={defaultValues}
        fields={enrichedFields}
        onSubmit={(values) => {
          updateMutation.mutate({ id: projectId, ...values });
        }}
        isPending={updateMutation.isPending}
      />
    </div>
  );
}

function EditProjectForm({
  defaultValues,
  fields,
  onSubmit,
  isPending,
}: {
  readonly defaultValues: ProjectFormValues;
  readonly fields: readonly FormedibleFieldConfig<ProjectFormValues>[];
  readonly onSubmit: (values: ProjectFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<ProjectFormValues>({
    schema: projectFormSchema,
    fields,
    formOptions: {
      defaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Save Changes",
    disabled: isPending,
  });

  return <Form className="space-y-4" />;
}
