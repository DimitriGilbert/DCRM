import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Input } from "@DCRM/ui/components/input";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { projectFormSchema, projectFormFields, projectFormDefaultValues } from "@/lib/forms/project-form-schema";
import type { ProjectFormValues } from "@/lib/forms/project-form-schema";

export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const listQuery = useQuery(
    trpc.project.list.queryOptions({ limit: 50 }),
  );

  const searchQueryResult = useQuery(
    trpc.project.search.queryOptions(
      { query: searchQuery, limit: 50 },
      { enabled: searchQuery.length > 0 },
    ),
  );

  const clientsQuery = useQuery(
    trpc.client.list.queryOptions({ limit: 100 }),
  );

  const clientLookup = Object.fromEntries(
    (clientsQuery.data?.items ?? []).map((c) => [c.id, c.name]),
  );

  const createMutation = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Project created");
        queryClient.invalidateQueries(trpc.project.list.queryFilter());
        setShowCreateDialog(false);
        if (data?.id) {
          // Navigate handled by closing dialog; user can find in list
        }
      },
      onError: (error) => {
        toast.error("Failed to create project", {
          description: error.message,
        });
      },
    }),
  );

  const projects = searchQuery.length > 0
    ? (searchQueryResult.data ?? [])
    : (listQuery.data?.items ?? []);

  const isLoading = searchQuery.length > 0
    ? searchQueryResult.isLoading
    : listQuery.isLoading;

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Input
            type="search"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "No projects match your search." : "No projects yet."}
          </p>
          {!searchQuery && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowCreateDialog(true)}
            >
              Create your first project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="block"
            >
              <Card size="sm" className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate text-sm">{project.name}</CardTitle>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {clientLookup[project.clientId] ?? "Unknown client"}
                  </p>
                  {project.budgetAmount != null && (
                    <p className="text-xs text-muted-foreground">
                      {project.budgetCurrency ?? "USD"} {project.budgetAmount.toLocaleString()}
                    </p>
                  )}
                  {project.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a new project for a client.</DialogDescription>
          </DialogHeader>
          <CreateProjectForm
            fields={enrichedFields}
            onSubmit={(values) => {
              createMutation.mutate(values);
            }}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
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

function ProjectStatusBadge({ status }: { readonly status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    planning: "outline",
    active: "default",
    on_hold: "secondary",
    completed: "secondary",
    archived: "outline",
  };
  const labels: Record<string, string> = {
    planning: "Planning",
    active: "Active",
    on_hold: "On Hold",
    completed: "Completed",
    archived: "Archived",
  };
  return (
    <Badge variant={variants[status] ?? "outline"} className="text-[10px]">
      {labels[status] ?? status}
    </Badge>
  );
}
