import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { ticketFormSchema, ticketFormFields } from "@/lib/forms/ticket-form-schema";
import type { TicketFormValues } from "@/lib/forms/ticket-form-schema";

export const Route = createFileRoute("/_authenticated/projects/$projectId/tickets/$ticketId/edit")({
  component: EditTicketPage,
});

function EditTicketPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { projectId, ticketId } = Route.useParams();

  const ticketQuery = useQuery(
    trpc.ticket.read.queryOptions({ id: ticketId }),
  );

  const updateMutation = useMutation(
    trpc.ticket.update.mutationOptions({
      onSuccess: () => {
        toast.success("Ticket updated");
        queryClient.invalidateQueries(trpc.ticket.list.queryFilter());
        queryClient.invalidateQueries(trpc.ticket.read.queryFilter({ id: ticketId }));
        navigate({
          to: "/projects/$projectId/tickets/$ticketId",
          params: { projectId, ticketId },
        });
      },
      onError: (error) => {
        toast.error("Failed to update ticket", {
          description: error.message,
        });
      },
    }),
  );

  if (ticketQuery.isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const ticket = ticketQuery.data;

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Ticket not found.</p>
      </div>
    );
  }

  const defaultValues: TicketFormValues = {
    title: ticket.title ?? "",
    description: ticket.description ?? "",
    type: ticket.type as TicketFormValues["type"],
    status: ticket.status as TicketFormValues["status"],
    priority: ticket.priority as TicketFormValues["priority"],
    dueDate: ticket.dueDate ? new Date(ticket.dueDate).toISOString().split("T")[0] : "",
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Edit Ticket</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate({
              to: "/projects/$projectId/tickets/$ticketId",
              params: { projectId, ticketId },
            })
          }
        >
          Cancel
        </Button>
      </div>
      <EditTicketForm
        defaultValues={defaultValues}
        onSubmit={(values) => {
          updateMutation.mutate({ id: ticketId, projectId, ...values });
        }}
        isPending={updateMutation.isPending}
      />
    </div>
  );
}

function EditTicketForm({
  defaultValues,
  onSubmit,
  isPending,
}: {
  readonly defaultValues: TicketFormValues;
  readonly onSubmit: (values: TicketFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<TicketFormValues>({
    schema: ticketFormSchema,
    fields: ticketFormFields,
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
