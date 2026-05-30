import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { AiHookForm } from "@/features/ai/hook-form";
import type { AiHookFormValues } from "@/features/ai/hook-form";
import { AiProviderForm } from "@/features/ai/provider-form";
import type { AiProviderFormValues } from "@/features/ai/provider-form";
import { IncomingWebhookForm } from "@/features/ai/incoming-webhook-form";
import type { IncomingWebhookFormValues } from "@/features/ai/incoming-webhook-form";
import { OutgoingWebhookForm } from "@/features/ai/outgoing-webhook-form";
import type { OutgoingWebhookSubmitValues } from "@/features/ai/outgoing-webhook-form";
import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/settings/ai")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
});

function RouteComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const providers = useQuery(trpc.ai.listProviders.queryOptions());
  const hooks = useQuery(trpc.automation.listAiHooks.queryOptions());
  const incomingWebhooks = useQuery(trpc.automation.listIncomingWebhooks.queryOptions());
  const outgoingWebhooks = useQuery(trpc.automation.listOutgoingWebhookHooks.queryOptions());
  const upsertProvider = useMutation(trpc.ai.upsertProvider.mutationOptions());
  const createAiHook = useMutation(trpc.automation.createAiHook.mutationOptions());
  const createIncomingWebhook = useMutation(trpc.automation.createIncomingWebhook.mutationOptions());
  const createOutgoingWebhook = useMutation(trpc.automation.createOutgoingWebhookHook.mutationOptions());

  async function handleSubmit(values: AiProviderFormValues) {
    await upsertProvider.mutateAsync(values);
    await queryClient.invalidateQueries({ queryKey: trpc.ai.listProviders.queryKey() });
    toast.success("AI provider saved", { description: "Your API key was encrypted before storage." });
  }

  async function handleHookSubmit(values: AiHookFormValues) {
    await createAiHook.mutateAsync(values);
    await queryClient.invalidateQueries({ queryKey: trpc.automation.listAiHooks.queryKey() });
    toast.success("AI hook saved", { description: "Structured outputs will be validated before mapping." });
  }

  async function handleOutgoingWebhookSubmit(values: OutgoingWebhookSubmitValues) {
    await createOutgoingWebhook.mutateAsync(values);
    await queryClient.invalidateQueries({ queryKey: trpc.automation.listOutgoingWebhookHooks.queryKey() });
    toast.success("Outgoing webhook saved", { description: "Secret-bearing auth values were encrypted before storage." });
  }

  async function handleIncomingWebhookSubmit(values: IncomingWebhookFormValues) {
    const saved = await createIncomingWebhook.mutateAsync(values);
    await queryClient.invalidateQueries({ queryKey: trpc.automation.listIncomingWebhooks.queryKey() });
    toast.success("Incoming webhook created in test mode", { description: saved.token ? "Copy the generated token now; it will not be shown again." : "Use preview responses before switching to live mode." });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="AI providers" description="Bring your own keys for OpenRouter, OpenAI-compatible, Anthropic-compatible, or Google Gemini models." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Add provider</CardTitle>
            <CardDescription>DCRM does not bundle AI credits. Provider credentials are encrypted at rest.</CardDescription>
          </CardHeader>
          <CardContent>
            <AiProviderForm submitting={upsertProvider.isPending} onSubmit={handleSubmit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Configured providers</CardTitle>
            <CardDescription>Only safe metadata is returned to the browser.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(providers.data ?? []).map((provider) => (
              <div key={provider.id} className="border p-3 text-sm">
                <div className="font-medium">{provider.name}</div>
                <div className="text-muted-foreground">{provider.type} · {provider.defaultModel ?? "No default model"}</div>
                <div className="text-muted-foreground">API key encrypted: {provider.hasApiKey ? "yes" : "no"}</div>
              </div>
            ))}
            {providers.data?.length === 0 ? <p className="text-muted-foreground text-sm">No AI providers configured yet.</p> : null}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Create incoming webhook</CardTitle>
            <CardDescription>Map external JSON payloads into internal DCRM events. New mappings start in test mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <IncomingWebhookForm submitting={createIncomingWebhook.isPending} onSubmit={handleIncomingWebhookSubmit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Incoming webhooks</CardTitle>
            <CardDescription>Test mode previews mapped event payloads; live mode emits webhook events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(incomingWebhooks.data ?? []).map((webhook) => (
              <div key={webhook.id} className="border p-3 text-sm">
                <div className="font-medium">{webhook.name}</div>
                <div className="text-muted-foreground">{webhook.targetEventType} · {webhook.mode} · /api/incoming-webhooks/{webhook.slug}</div>
                <div className="text-muted-foreground">Mappings: {Array.isArray(webhook.mappingConfig.mappings) ? webhook.mappingConfig.mappings.length : 0}</div>
              </div>
            ))}
            {incomingWebhooks.data?.length === 0 ? <p className="text-muted-foreground text-sm">No incoming webhooks configured yet.</p> : null}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Create AI hook</CardTitle>
            <CardDescription>Configure structured output, field mapping, and propose-first or direct-write behavior.</CardDescription>
          </CardHeader>
          <CardContent>
            <AiHookForm submitting={createAiHook.isPending} onSubmit={handleHookSubmit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI hooks</CardTitle>
            <CardDescription>Direct writes suppress downstream hook automation unless explicitly changed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(hooks.data ?? []).map((hook) => (
              <div key={hook.id} className="border p-3 text-sm">
                <div className="font-medium">{hook.name}</div>
                <div className="text-muted-foreground">{hook.eventType} · {hook.writeBehavior} · downstream {hook.downstreamEventBehavior}</div>
              </div>
            ))}
            {hooks.data?.length === 0 ? <p className="text-muted-foreground text-sm">No AI hooks configured yet.</p> : null}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Create outgoing webhook</CardTitle>
            <CardDescription>Send event payloads to external tools with encrypted authentication secrets and retry protection.</CardDescription>
          </CardHeader>
          <CardContent>
            <OutgoingWebhookForm submitting={createOutgoingWebhook.isPending} onSubmit={handleOutgoingWebhookSubmit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Outgoing webhooks</CardTitle>
            <CardDescription>Secret values are never returned to the browser after saving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(outgoingWebhooks.data ?? []).map((hook) => (
              <div key={hook.id} className="border p-3 text-sm">
                <div className="font-medium">{hook.name}</div>
                <div className="text-muted-foreground">{hook.eventType} · {hook.authType} · {hook.url}</div>
                {hook.customHeaderNames.length > 0 ? <div className="text-muted-foreground">Secret headers: {hook.customHeaderNames.join(", ")}</div> : null}
              </div>
            ))}
            {outgoingWebhooks.data?.length === 0 ? <p className="text-muted-foreground text-sm">No outgoing webhooks configured yet.</p> : null}
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
