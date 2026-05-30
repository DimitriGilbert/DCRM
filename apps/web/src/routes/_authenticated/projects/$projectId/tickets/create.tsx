import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { ticketFormSchema, ticketFormFields, ticketFormDefaultValues } from "@/lib/forms/ticket-form-schema";
import type { TicketFormValues } from "@/lib/forms/ticket-form-schema";

export const Route = createFileRoute("/_authenticated/projects/$projectId/tickets/create")({
  component: CreateTicketPage,
});

function CreateTicketPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { projectId } = Route.useParams();

  const projectQuery = useQuery(
    trpc.project.read.queryOptions({ id: projectId }),
  );

  const createMutation = useMutation(
    trpc.ticket.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Ticket created");
        queryClient.invalidateQueries(trpc.ticket.list.queryFilter());
        navigate({
          to: "/projects/$projectId/tickets/$ticketId",
          params: { projectId, ticketId: data?.id ?? "" },
        });
      },
      onError: (error) => {
        toast.error("Failed to create ticket", {
          description: error.message,
        });
      },
    }),
  );

  if (projectQuery.isLoading) {
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

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-sm font-medium">New Ticket in {project.name}</h2>
      <CreateTicketForm
        onSubmit={(values) => {
          createMutation.mutate({ projectId, ...values });
        }}
        isPending={createMutation.isPending}
      />
    </div>
  );
}

function CreateTicketForm({
  onSubmit,
  isPending,
}: {
  readonly onSubmit: (values: TicketFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<TicketFormValues>({
    schema: ticketFormSchema,
    fields: ticketFormFields,
    formOptions: {
      defaultValues: ticketFormDefaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Create Ticket",
    disabled: isPending,
  });

  return <Form className="space-y-4" />;
}
