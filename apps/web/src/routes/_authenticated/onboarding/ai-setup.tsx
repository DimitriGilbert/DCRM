import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, Sparkles } from "lucide-react";

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

export const Route = createFileRoute(
  "/_authenticated/onboarding/ai-setup",
)({
  component: OnboardingAISetupPage,
});

export default function OnboardingAISetupPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const settingsQuery = useQuery(
    trpc.settings.get.queryOptions(),
  );

  const onboardingCompleted = settingsQuery.data?.onboardingCompleted ?? false;

  useEffect(() => {
    if (onboardingCompleted) {
      void navigate({ to: "/dashboard" });
    }
  }, [onboardingCompleted, navigate]);

  if (onboardingCompleted) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <Link to="/onboarding">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            AI Provider Setup
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure your AI provider (BYOK). You can skip this and set it up later.
          </p>
        </div>
      </div>

      <AIProvidersListSection onAddClick={() => setShowAddDialog(true)} />

      <div className="flex justify-end gap-2">
        <Link to="/onboarding">
          <Button variant="outline" size="sm">Back</Button>
        </Link>
        <Link to="/onboarding/email-setup">
          <Button size="sm">Continue</Button>
        </Link>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add AI Provider</DialogTitle>
          </DialogHeader>
          <AddProviderForm onSuccess={() => setShowAddDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AIProvidersListSection({ onAddClick }: { readonly onAddClick: () => void }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.aiProvider.list.queryOptions());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>
            API keys are encrypted at rest.
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
