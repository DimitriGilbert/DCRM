import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { clientFormSchema, clientFormFields, clientFormDefaultValues } from "@/lib/forms/client-form-schema";
import type { ClientFormValues } from "@/lib/forms/client-form-schema";

export const Route = createFileRoute("/_authenticated/clients/create")({
  component: CreateClientPage,
});

function CreateClientPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation(
    trpc.client.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Client created");
        queryClient.invalidateQueries(trpc.client.list.queryFilter());
        navigate({ to: "/clients/$clientId", params: { clientId: data?.id ?? "" } });
      },
      onError: (error) => {
        toast.error("Failed to create client", {
          description: error.message,
        });
      },
    }),
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-sm font-medium">New Client</h2>
      <CreateClientForm
        onSubmit={(values) => {
          createMutation.mutate(values);
        }}
        isPending={createMutation.isPending}
      />
    </div>
  );
}

function CreateClientForm({
  onSubmit,
  isPending,
}: {
  readonly onSubmit: (values: ClientFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<ClientFormValues>({
    schema: clientFormSchema,
    fields: clientFormFields,
    formOptions: {
      defaultValues: clientFormDefaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Create Client",
    disabled: isPending,
  });

  return <Form className="space-y-4" />;
}
