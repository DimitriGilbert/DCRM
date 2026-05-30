import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { projectFormSchema, projectFormFields, projectFormDefaultValues } from "@/lib/forms/project-form-schema";
import type { ProjectFormValues } from "@/lib/forms/project-form-schema";

export const Route = createFileRoute("/_authenticated/projects/create")({
  component: CreateProjectPage,
});

function CreateProjectPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const clientsQuery = useQuery(
    trpc.client.list.queryOptions({ limit: 100 }),
  );

  const createMutation = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.project.list.queryFilter());
        if (data?.id) {
          toast.success("Project created");
          navigate({ to: "/projects/$projectId", params: { projectId: data.id } });
        } else {
          toast.error("Project created but failed to retrieve ID");
          navigate({ to: "/projects" });
        }
      },
      onError: (error) => {
        toast.error("Failed to create project", {
          description: error.message,
        });
      },
    }),
  );

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
      <h2 className="text-sm font-medium">New Project</h2>
      <CreateProjectForm
        fields={enrichedFields}
        onSubmit={(values) => {
          createMutation.mutate(values);
        }}
        isPending={createMutation.isPending}
      />
    </div>
  );
}

function CreateProjectForm({
  fields,
  onSubmit,
  isPending,
}: {
  readonly fields: readonly FormedibleFieldConfig<ProjectFormValues>[];
  readonly onSubmit: (values: ProjectFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<ProjectFormValues>({
    schema: projectFormSchema,
    fields,
    formOptions: {
      defaultValues: projectFormDefaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Create Project",
    disabled: isPending,
  });

  return <Form className="space-y-4" />;
}
