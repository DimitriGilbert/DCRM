import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import {
  aiProviderFormSchema,
  aiProviderFormFields,
  aiProviderFormDefaultValues,
} from "@/lib/forms/ai-provider-form-schema";
import type { AIProviderFormValues } from "@/lib/forms/ai-provider-form-schema";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <AIProvidersSection
        onAddClick={() => setShowAddDialog(true)}
      />

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add AI Provider</DialogTitle>
          </DialogHeader>
          <AddProviderForm
            onSuccess={() => setShowAddDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AIProvidersSection({ onAddClick }: { readonly onAddClick: () => void }) {
  const trpc = useTRPC();

  const query = useQuery(
    trpc.aiProvider.list.queryOptions(),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>
            Configure your AI providers (BYOK). API keys are encrypted at rest.
          </CardDescription>
        </div>
        <Button size="sm" onClick={onAddClick}>
          Add Provider
        </Button>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !query.data?.length ? (
          <p className="text-sm text-muted-foreground">
            No AI providers configured. Add one to enable AI features.
          </p>
        ) : (
          <div className="divide-y">
            {query.data.map((provider) => (
              <ProviderRow key={provider.id} provider={provider} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderRow({
  provider,
}: {
  readonly provider: {
    id: string;
    provider: string;
    name: string;
    enabled: boolean;
    baseUrl: string | null;
  };
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation(
    trpc.aiProvider.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Provider removed");
        queryClient.invalidateQueries(trpc.aiProvider.list.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to remove provider", { description: error.message });
      },
    }),
  );

  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium">{provider.name}</p>
        <p className="text-xs text-muted-foreground">
          {provider.provider}
          {provider.baseUrl ? ` · ${provider.baseUrl}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs ${provider.enabled ? "text-green-600" : "text-muted-foreground"}`}
        >
          {provider.enabled ? "Active" : "Disabled"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => deleteMutation.mutate({ id: provider.id })}
          disabled={deleteMutation.isPending}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function AddProviderForm({ onSuccess }: { readonly onSuccess: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createMutation = useMutation(
    trpc.aiProvider.create.mutationOptions({
      onSuccess: () => {
        toast.success("Provider added");
        queryClient.invalidateQueries(trpc.aiProvider.list.queryFilter());
        onSuccess();
      },
      onError: (error) => {
        toast.error("Failed to add provider", { description: error.message });
      },
    }),
  );

  const { Form } = useFormedible<AIProviderFormValues>({
    schema: aiProviderFormSchema,
    fields: aiProviderFormFields,
    formOptions: {
      defaultValues: aiProviderFormDefaultValues,
      onSubmit: async ({ value }) => {
        createMutation.mutate(value);
      },
    },
    submitLabel: "Add Provider",
    disabled: createMutation.isPending,
  });

  return (
    <div className="space-y-4">
      <Form className="space-y-4" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
