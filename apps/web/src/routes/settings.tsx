import { createTranslator, resolveLocale } from "@DCRM/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { PreferencesForm } from "@/features/settings/preferences-form";
import type { PreferencesFormValues } from "@/features/settings/preferences-form";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/settings")({
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
  const { setTheme } = useTheme();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const updatePreferences = useMutation(trpc.settings.updatePreferences.mutationOptions());
  const locale = resolveLocale(settings.data?.locale);
  const t = createTranslator(locale);

  async function handleSubmit(values: PreferencesFormValues) {
    await updatePreferences.mutateAsync(values);
    setTheme(values.theme);
    await queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey() });
    toast.success("Preferences saved", { description: "Your language and theme choices were updated." });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Preferences" description="Manage personal application preferences and setup entry points for DCRM." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Language and theme</CardTitle>
            <CardDescription>Locale and appearance preferences are scoped directly to your user account.</CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm defaultLocale={locale} defaultTheme={settings.data?.theme ?? "system"} submitting={updatePreferences.isPending || settings.isLoading} onSubmit={handleSubmit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>Continue optional configuration for AI providers and mailbox sync when you are ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link to="/settings/ai" className="block border p-3 hover:bg-muted">
              <span className="font-medium">AI providers</span>
              <span className="mt-1 block text-muted-foreground">Configure BYOK providers for TanStack AI-powered chat and automations.</span>
            </Link>
            <Link to="/settings/email" className="block border p-3 hover:bg-muted">
              <span className="font-medium">Email</span>
              <span className="mt-1 block text-muted-foreground">Configure encrypted IMAP/SMTP credentials and authorized sender matching.</span>
            </Link>
            <Link to="/settings/billing" className="block border p-3 hover:bg-muted">
              <span className="font-medium">Billing</span>
              <span className="mt-1 block text-muted-foreground">Review hosted billing status and Stripe checkout for the $24/year plan.</span>
            </Link>
            <p className="text-muted-foreground">Onboarding status: {settings.data?.onboardingCompleted ? "completed" : t("appShell.navigation.onboarding")}</p>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
