import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { leadFormSchema, leadFormFields, leadFormDefaultValues, toLeadFormInput } from "@/lib/forms/lead-form-schema";
import type { LeadFormValues } from "@/lib/forms/lead-form-schema";

export const Route = createFileRoute("/_authenticated/leads/create")({
  component: CreateLeadPage,
});

function CreateLeadPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation(
    trpc.lead.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Lead created");
        queryClient.invalidateQueries(trpc.lead.list.queryFilter());
        navigate({ to: "/leads/$leadId", params: { leadId: data?.id ?? "" } });
      },
      onError: (error) => {
        toast.error("Failed to create lead", {
          description: error.message,
        });
      },
    }),
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-sm font-medium">New Lead</h2>
      <CreateLeadForm
        onSubmit={(values) => {
          createMutation.mutate(toLeadFormInput(values));
        }}
        isPending={createMutation.isPending}
      />
    </div>
  );
}

function CreateLeadForm({
  onSubmit,
  isPending,
}: {
  readonly onSubmit: (values: LeadFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<LeadFormValues>({
    schema: leadFormSchema,
    fields: leadFormFields,
    formOptions: {
      defaultValues: leadFormDefaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Create Lead",
    disabled: isPending,
  });

  return <Form className="space-y-4" />;
}
