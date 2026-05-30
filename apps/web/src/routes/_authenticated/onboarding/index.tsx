import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Globe, Mail, Sparkles } from "lucide-react";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent } from "@DCRM/ui/components/card";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import {
  localeFormSchema,
  localeFormFields,
} from "@/lib/forms/appearance-form-schema";
import type { LocaleFormValues } from "@/lib/forms/appearance-form-schema";

export const Route = createFileRoute(
  "/_authenticated/onboarding/",
)({
  component: OnboardingWizard,
});

type WizardStep = "language" | "ai-setup" | "email-setup" | "done";

const STEPS: readonly { key: WizardStep; label: string; skippable: boolean }[] = [
  { key: "language", label: "Language", skippable: false },
  { key: "ai-setup", label: "AI Setup", skippable: true },
  { key: "email-setup", label: "Email Setup", skippable: true },
  { key: "done", label: "Done", skippable: false },
] as const;

export default function OnboardingWizard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const settingsQuery = useQuery(
    trpc.settings.get.queryOptions(),
  );

  const completeOnboardingMutation = useMutation(
    trpc.settings.completeOnboarding.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.settings.get.queryFilter());
      },
    }),
  );

  const updateLocaleMutation = useMutation(
    trpc.settings.updateLocale.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.settings.get.queryFilter());
      },
    }),
  );

  const [currentStep, setCurrentStep] = useState<WizardStep>("language");
  const [selectedLocale, setSelectedLocale] = useState("en");

  const onboardingCompleted = settingsQuery.data?.onboardingCompleted ?? false;

  useEffect(() => {
    if (onboardingCompleted) {
      void navigate({ to: "/dashboard" });
    }
  }, [onboardingCompleted, navigate]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  function handleNext() {
    if (currentStep === "done") {
      completeOnboardingMutation.mutate(
        { locale: selectedLocale },
        {
          onSuccess: () => {
            toast.success("Welcome to DCRM!");
            void navigate({ to: "/dashboard" });
          },
        },
      );
      return;
    }
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]!.key);
    }
  }

  function handleSkip() {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]!.key);
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (onboardingCompleted) {
    return null;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-8 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to DCRM
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Let&apos;s get you set up in a few steps
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex w-full items-center gap-1">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStepIndex;
          const isCurrent = step.key === currentStep;
          return (
            <div key={step.key} className="flex flex-1 items-center gap-1">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                      ? "bg-primary/15 text-primary ring-1 ring-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 transition-colors ${
                    isCompleted ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card className="w-full">
        <CardContent className="space-y-6 pt-6">
          {currentStep === "language" && (
            <LanguageStep
              selectedLocale={selectedLocale}
              onSelect={(locale) => {
                setSelectedLocale(locale);
                updateLocaleMutation.mutate({ locale });
              }}
              isPending={updateLocaleMutation.isPending}
            />
          )}
          {currentStep === "ai-setup" && (
            <AISetupStep />
          )}
          {currentStep === "email-setup" && (
            <EmailSetupStep />
          )}
          {currentStep === "done" && (
            <DoneStep />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            {STEPS[currentStepIndex]?.skippable ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-xs text-muted-foreground"
              >
                Skip for now
              </Button>
            ) : (
              <div />
            )}
            <Button
              size="sm"
              onClick={handleNext}
              disabled={completeOnboardingMutation.isPending}
            >
              {currentStep === "done" ? (
                <>
                  Get Started
                  <Check className="ml-1.5 h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LanguageStep({
  selectedLocale,
  onSelect,
  isPending,
}: {
  readonly selectedLocale: string;
  readonly onSelect: (locale: string) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<LocaleFormValues>({
    schema: localeFormSchema,
    fields: localeFormFields,
    formOptions: {
      defaultValues: { locale: selectedLocale },
      onSubmit: async ({ value }) => {
        onSelect(value.locale);
      },
    },
    disabled: isPending,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Choose your language</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Select your preferred language for the interface.
      </p>
      <Form className="space-y-2" />
    </div>
  );
}

function AISetupStep() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold">AI Provider Setup</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        DCRM supports BYOK (Bring Your Own Key) AI integration. Configure an AI
        provider to enable smart features like client insights, email drafting,
        and conversation analysis. You can always set this up later in Settings.
      </p>
      <p className="text-xs text-muted-foreground">
        Supported providers: OpenRouter, OpenAI, Anthropic, and Google.
      </p>
    </div>
  );
}

function EmailSetupStep() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Email Setup</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Connect your email account via IMAP/SMTP to sync incoming and outgoing
        messages with your CRM contacts. All credentials are encrypted at rest.
        You can always set this up later in Settings.
      </p>
      <p className="text-xs text-muted-foreground">
        Supports any standard IMAP/SMTP provider (Gmail, Outlook, Fastmail,
        custom domains).
      </p>
    </div>
  );
}

function DoneStep() {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Check className="h-6 w-6 text-primary" />
      </div>
      <h2 className="text-sm font-semibold">You&apos;re all set!</h2>
      <p className="text-xs text-muted-foreground">
        Your CRM is ready. You can add clients, track leads, manage projects,
        and configure additional settings from the sidebar at any time.
      </p>
    </div>
  );
}
