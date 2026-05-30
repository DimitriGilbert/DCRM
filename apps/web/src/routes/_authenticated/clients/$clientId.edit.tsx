import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { clientFormSchema, clientFormFields } from "@/lib/forms/client-form-schema";
import type { ClientFormValues } from "@/lib/forms/client-form-schema";

export const Route = createFileRoute("/_authenticated/clients/$clientId/edit")({
  component: EditClientPage,
});

function EditClientPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { clientId } = Route.useParams();

  const clientQuery = useQuery(
    trpc.client.read.queryOptions({ id: clientId }),
  );

  const updateMutation = useMutation(
    trpc.client.update.mutationOptions({
      onSuccess: () => {
        toast.success("Client updated");
        queryClient.invalidateQueries(trpc.client.list.queryFilter());
        queryClient.invalidateQueries(trpc.client.read.queryFilter({ id: clientId }));
        navigate({ to: "/clients/$clientId", params: { clientId } });
      },
      onError: (error) => {
        toast.error("Failed to update client", {
          description: error.message,
        });
      },
    }),
  );

  if (clientQuery.isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const client = clientQuery.data;

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Client not found.</p>
      </div>
    );
  }

  const defaultValues: ClientFormValues = {
    name: client.name ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    company: client.company ?? "",
    website: client.website ?? "",
    notes: client.notes ?? "",
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Edit Client</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/clients/$clientId", params: { clientId } })}
        >
          Cancel
        </Button>
      </div>
      <EditClientForm
        defaultValues={defaultValues}
        onSubmit={(values) => {
          updateMutation.mutate({ id: clientId, ...values });
        }}
        isPending={updateMutation.isPending}
      />
    </div>
  );
}

function EditClientForm({
  defaultValues,
  onSubmit,
  isPending,
}: {
  readonly defaultValues: ClientFormValues;
  readonly onSubmit: (values: ClientFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<ClientFormValues>({
    schema: clientFormSchema,
    fields: clientFormFields,
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
