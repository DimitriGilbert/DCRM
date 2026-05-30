import { Badge } from "@DCRM/ui/components/badge";
import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/settings/billing")({
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
  const billing = useQuery(trpc.billing.getOverview.queryOptions());
  const checkout = useMutation(trpc.billing.createCheckoutSession.mutationOptions());
  const overview = billing.data;

  async function handleCheckout() {
    const session = await checkout.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: trpc.billing.getOverview.queryKey() });
    toast.success("Redirecting to Stripe Checkout", { description: "Stripe securely handles card details and subscription confirmation." });
    window.location.assign(session.url);
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Billing" description="Hosted DCRM is $24/year. Self-hosted installs can run with billing disabled and no Stripe credentials." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Hosted subscription</CardTitle>
            <CardDescription>Billing gates hosted access only when the operator enables Stripe billing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between border p-3">
              <div>
                <div className="font-medium">DCRM Hosted</div>
                <div className="text-muted-foreground">$24/year · single-user CRM hosting</div>
              </div>
              <Badge variant={overview?.hasActiveSubscription ? "default" : "outline"}>{overview?.hasActiveSubscription ? "Active" : "Inactive"}</Badge>
            </div>
            {overview?.enabled ? (
              <Button type="button" disabled={checkout.isPending || overview.hasActiveSubscription} onClick={handleCheckout}>
                {overview.hasActiveSubscription ? "Subscription active" : "Subscribe with Stripe"}
              </Button>
            ) : (
              <p className="border p-3 text-muted-foreground">Hosted billing is disabled for this installation. Stripe environment variables are not required.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscription status</CardTitle>
            <CardDescription>Status is stored locally and updated from verified Stripe webhooks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Billing mode: {overview?.enabled ? "hosted Stripe billing" : "self-host / disabled"}</p>
            <p>Status: {overview?.subscription?.status ?? "not configured"}</p>
            <p>Current period ends: {overview?.subscription?.currentPeriodEnd ? new Date(overview.subscription.currentPeriodEnd).toLocaleDateString() : "not available"}</p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
