import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@DCRM/ui/components/dialog";
import { Badge } from "@DCRM/ui/components/badge";
import { Skeleton } from "@DCRM/ui/components/skeleton";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import {
  incomingWebhookFormSchema,
  incomingWebhookFormFields,
  incomingWebhookFormDefaultValues,
} from "@/lib/forms/incoming-webhook-form-schema";
import type { IncomingWebhookFormValues } from "@/lib/forms/incoming-webhook-form-schema";

export const Route = createFileRoute("/_authenticated/settings/incoming-webhooks")({
  component: IncomingWebhooksPage,
});

function IncomingWebhooksPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Incoming Webhooks</h1>
          <p className="text-sm text-muted-foreground">
            External services can send data to DCRM through incoming webhooks.
            Mapped data creates internal events — no direct record mutation.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          Add Webhook
        </Button>
      </div>

      <IncomingWebhooksList />

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Incoming Webhook</DialogTitle>
          </DialogHeader>
          <AddWebhookForm onSuccess={() => setShowAddDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IncomingWebhooksList() {
  const trpc = useTRPC();
  const query = useQuery(trpc.incomingWebhook.list.queryOptions());

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!query.data?.length) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No incoming webhooks configured. Add one to receive data from external services.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {query.data.map((webhook) => (
        <WebhookCard key={webhook.id} webhook={webhook} />
      ))}
    </div>
  );
}

function WebhookCard({
  webhook,
}: {
  readonly webhook: {
    id: string;
    name: string;
    urlToken: string;
    mode: string;
    enabled: boolean;
    mappingConfig: Record<string, unknown> | null;
    lastReceivedAt: string | null;
    createdAt: string;
  };
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showMapping, setShowMapping] = useState(false);
  const [samplePayload, setSamplePayload] = useState("{}");
  const [previewResult, setPreviewResult] = useState<Record<string, unknown> | null>(null);

  const deleteMutation = useMutation(
    trpc.incomingWebhook.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Webhook deleted");
        queryClient.invalidateQueries(trpc.incomingWebhook.list.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to delete webhook", { description: error.message });
      },
    }),
  );

  const toggleModeMutation = useMutation(
    trpc.incomingWebhook.update.mutationOptions({
      onSuccess: () => {
        toast.success("Mode updated");
        queryClient.invalidateQueries(trpc.incomingWebhook.list.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to update mode", { description: error.message });
      },
    }),
  );

  const testMutation = useMutation(
    trpc.incomingWebhook.testMapping.mutationOptions({
      onSuccess: (result) => {
        setPreviewResult(result as Record<string, unknown>);
      },
      onError: (error) => {
        toast.error("Mapping test failed", { description: error.message });
      },
    }),
  );

  const webhookUrl = `/api/webhook/${webhook.urlToken}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">{webhook.name}</CardTitle>
          <CardDescription className="font-mono text-xs">
            POST {webhookUrl}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={webhook.mode === "live" ? "default" : "secondary"}>
            {webhook.mode === "live" ? "Live" : "Test"}
          </Badge>
          <Badge variant={webhook.enabled ? "default" : "outline"}>
            {webhook.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {webhook.mode === "test" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                toggleModeMutation.mutate({ id: webhook.id, mode: "live" });
              }}
              disabled={toggleModeMutation.isPending}
            >
              Switch to Live
            </Button>
          )}
          {webhook.mode === "live" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                toggleModeMutation.mutate({ id: webhook.id, mode: "test" });
              }}
              disabled={toggleModeMutation.isPending}
            >
              Switch to Test
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowMapping(!showMapping)}
          >
            {showMapping ? "Hide Mapping" : "Test Mapping"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteMutation.mutate({ id: webhook.id })}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>

        {webhook.mappingConfig && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Mapping Config</p>
            <pre className="mt-1 overflow-x-auto text-xs">
              {JSON.stringify(webhook.mappingConfig, null, 2)}
            </pre>
          </div>
        )}

        {showMapping && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Test Mapping</p>
            <textarea
              className="w-full rounded-md border bg-background p-2 font-mono text-xs"
              rows={6}
              value={samplePayload}
              onChange={(e) => setSamplePayload(e.target.value)}
              placeholder='{"data": {"email": "test@example.com"}}'
            />
            <Button
              size="sm"
              onClick={() => {
                try {
                  const parsed = JSON.parse(samplePayload);
                  testMutation.mutate({
                    id: webhook.id,
                    samplePayload: parsed,
                  });
                } catch {
                  toast.error("Invalid JSON");
                }
              }}
              disabled={testMutation.isPending}
            >
              Preview Mapping
            </Button>
            {previewResult && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">Preview Result</p>
                <pre className="mt-1 overflow-x-auto text-xs">
                  {JSON.stringify(previewResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {webhook.lastReceivedAt && (
          <p className="text-xs text-muted-foreground">
            Last received: {new Date(webhook.lastReceivedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AddWebhookForm({ onSuccess }: { readonly onSuccess: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createMutation = useMutation(
    trpc.incomingWebhook.create.mutationOptions({
      onSuccess: () => {
        toast.success("Incoming webhook created in test mode");
        queryClient.invalidateQueries(trpc.incomingWebhook.list.queryFilter());
        onSuccess();
      },
      onError: (error) => {
        toast.error("Failed to create webhook", { description: error.message });
      },
    }),
  );

  const { Form } = useFormedible<IncomingWebhookFormValues>({
    schema: incomingWebhookFormSchema,
    fields: incomingWebhookFormFields,
    formOptions: {
      defaultValues: incomingWebhookFormDefaultValues,
      onSubmit: async ({ value }) => {
        createMutation.mutate({
          name: value.name,
          secret: value.secret || undefined,
        });
      },
    },
    submitLabel: "Create Webhook",
    disabled: createMutation.isPending,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        New webhooks start in test mode. You can preview mapped payloads before switching to live.
      </p>
      <Form className="space-y-4" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
