import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { AiProviderForm } from "@/features/ai/provider-form";
import type { AiProviderFormValues } from "@/features/ai/provider-form";
import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { EmailAccountForm } from "@/features/email/forms";
import type { EmailAccountFormValues } from "@/features/email/forms";
import { PreferencesForm } from "@/features/settings/preferences-form";
import type { PreferencesFormValues } from "@/features/settings/preferences-form";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

type OnboardingStep = "language" | "ai" | "email" | "done";

const steps = ["language", "ai", "email", "done"] satisfies readonly OnboardingStep[];

export const Route = createFileRoute("/onboarding")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
    const settings = await context.queryClient.ensureQueryData(context.trpc.settings.get.queryOptions());
    if (settings.onboardingCompleted) {
      throw redirect({ to: "/settings" });
    }
  },
});

function RouteComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const updatePreferences = useMutation(trpc.settings.updatePreferences.mutationOptions());
  const upsertProvider = useMutation(trpc.ai.upsertProvider.mutationOptions());
  const upsertEmailAccount = useMutation(trpc.email.upsertAccount.mutationOptions());
  const completeOnboarding = useMutation(trpc.settings.completeOnboarding.mutationOptions());
  const [step, setStep] = useState<OnboardingStep>("language");

  async function handlePreferencesSubmit(values: PreferencesFormValues) {
    await updatePreferences.mutateAsync(values);
    setTheme(values.theme);
    await queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey() });
    setStep("ai");
  }

  async function handleAiSubmit(values: AiProviderFormValues) {
    await upsertProvider.mutateAsync(values);
    await queryClient.invalidateQueries({ queryKey: trpc.ai.listProviders.queryKey() });
    toast.success("AI provider saved", { description: "You can add more providers later from settings." });
    setStep("email");
  }

  async function handleEmailSubmit(values: EmailAccountFormValues) {
    await upsertEmailAccount.mutateAsync(values);
    await queryClient.invalidateQueries({ queryKey: trpc.email.listAccounts.queryKey() });
    toast.success("Email account saved", { description: "You can refine sender matching later from settings." });
    setStep("done");
  }

  async function finishOnboarding() {
    await completeOnboarding.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey() });
    toast.success("Onboarding complete");
    await navigate({ to: "/dashboard" });
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Onboarding" title="Set up DCRM" description="Choose your preferences, optionally connect AI and email, then start using your CRM." />
      <div className="mb-6 grid gap-2 sm:grid-cols-4">
        {steps.map((item, index) => (
          <div key={item} className={`border p-3 text-sm ${item === step ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
            <span className="block text-xs uppercase tracking-wide">Step {index + 1}</span>
            <span className="font-medium capitalize">{item === "ai" ? "AI provider" : item}</span>
          </div>
        ))}
      </div>
      {step === "language" ? (
        <OnboardingCard title="Language and theme" description="Pick the preferences DCRM should use for this account.">
          <PreferencesForm defaultLocale={settings.data?.locale ?? "en"} defaultTheme={settings.data?.theme ?? "system"} submitting={updatePreferences.isPending || settings.isLoading} submitLabel="Continue" onSubmit={handlePreferencesSubmit} />
        </OnboardingCard>
      ) : null}
      {step === "ai" ? (
        <OnboardingCard title="AI provider" description="Optional. DCRM is BYOK and stores provider keys encrypted at rest.">
          <AiProviderForm submitting={upsertProvider.isPending} onSubmit={handleAiSubmit} />
          <Button className="mt-4" variant="outline" onClick={() => setStep("email")}>Skip AI setup</Button>
        </OnboardingCard>
      ) : null}
      {step === "email" ? (
        <OnboardingCard title="Email setup" description="Optional. Connect IMAP/SMTP now or configure it later from settings.">
          <EmailAccountForm submitting={upsertEmailAccount.isPending} onSubmit={handleEmailSubmit} />
          <Button className="mt-4" variant="outline" onClick={() => setStep("done")}>Skip email setup</Button>
        </OnboardingCard>
      ) : null}
      {step === "done" ? (
        <OnboardingCard title="Ready to go" description="Your required onboarding preferences are saved. Optional setup can be changed from settings at any time.">
          <Button disabled={completeOnboarding.isPending} onClick={finishOnboarding}>Finish onboarding</Button>
        </OnboardingCard>
      ) : null}
    </PageFrame>
  );
}

function OnboardingCard({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
