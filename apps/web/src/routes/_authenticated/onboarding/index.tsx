import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@DCRM/ui/components/button";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute(
  "/_authenticated/onboarding/",
)({
  component: OnboardingPage,
});

/** Placeholder onboarding page — language selection step. */
export default function OnboardingPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery(
    trpc.settings.get.queryOptions(),
  );

  const updateLocaleMutation = useMutation(
    trpc.settings.updateLocale.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(
          trpc.settings.get.queryFilter(),
        );
      },
    }),
  );

  const currentLocale = settingsQuery.data?.locale ?? "en";
  const isLoading = settingsQuery.isLoading;

  function handleLocaleSelect(locale: string) {
    updateLocaleMutation.mutate({ locale });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 py-16">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Welcome to DCRM</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose your language
        </p>
      </div>

      <div className="w-full space-y-2">
        <Button
          variant={currentLocale === "en" ? "default" : "outline"}
          className="w-full"
          onClick={() => handleLocaleSelect("en")}
          disabled={updateLocaleMutation.isPending}
        >
          English
        </Button>
      </div>

      <Button variant="ghost" className="text-xs text-muted-foreground">
        Skip
      </Button>
    </div>
  );
}
