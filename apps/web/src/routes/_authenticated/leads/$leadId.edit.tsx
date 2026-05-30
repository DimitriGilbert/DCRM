import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import { leadFormSchema, leadFormFields } from "@/lib/forms/lead-form-schema";
import type { LeadFormValues } from "@/lib/forms/lead-form-schema";

export const Route = createFileRoute("/_authenticated/leads/$leadId/edit")({
  component: EditLeadPage,
});

function EditLeadPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { leadId } = Route.useParams();

  const leadQuery = useQuery(
    trpc.lead.read.queryOptions({ id: leadId }),
  );

  const updateMutation = useMutation(
    trpc.lead.update.mutationOptions({
      onSuccess: () => {
        toast.success("Lead updated");
        queryClient.invalidateQueries(trpc.lead.list.queryFilter());
        queryClient.invalidateQueries(trpc.lead.read.queryFilter({ id: leadId }));
        navigate({ to: "/leads/$leadId", params: { leadId } });
      },
      onError: (error) => {
        toast.error("Failed to update lead", {
          description: error.message,
        });
      },
    }),
  );

  if (leadQuery.isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const lead = leadQuery.data;

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Lead not found.</p>
      </div>
    );
  }

  const defaultValues: LeadFormValues = {
    name: lead.name ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    company: lead.company ?? "",
    website: lead.website ?? "",
    notes: lead.notes ?? "",
    source: lead.source ?? "",
    stage: lead.stage ?? "new",
    estimatedValue: lead.estimatedValue ?? undefined,
    currency: lead.currency ?? "USD",
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Edit Lead</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/leads/$leadId", params: { leadId } })}
        >
          Cancel
        </Button>
      </div>
      <EditLeadForm
        leadId={leadId}
        defaultValues={defaultValues}
        onSubmit={(values) => {
          updateMutation.mutate({ id: leadId, ...values });
        }}
        isPending={updateMutation.isPending}
      />
    </div>
  );
}

function EditLeadForm({
  leadId,
  defaultValues,
  onSubmit,
  isPending,
}: {
  readonly leadId: string;
  readonly defaultValues: LeadFormValues;
  readonly onSubmit: (values: LeadFormValues) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<LeadFormValues>({
    schema: leadFormSchema,
    fields: leadFormFields,
    formOptions: {
      defaultValues,
      onSubmit: async ({ value }) => {
        onSubmit(value);
      },
    },
    submitLabel: "Save Changes",
    disabled: isPending,
  });

  void leadId;

  return <Form className="space-y-4" />;
}
