import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Globe } from "lucide-react";

import { Button } from "@DCRM/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";

import { useTRPC } from "@/utils/trpc";
import {
  themeFormSchema,
  themeFormFields,
  localeFormSchema,
  localeFormFields,
} from "@/lib/forms/appearance-form-schema";
import type { ThemeFormValues, LocaleFormValues } from "@/lib/forms/appearance-form-schema";

export const Route = createFileRoute("/_authenticated/settings/appearance")({
  component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery(
    trpc.settings.get.queryOptions(),
  );

  const updateThemeMutation = useMutation(
    trpc.settings.updateTheme.mutationOptions({
      onSuccess: () => {
        toast.success("Theme updated");
        void queryClient.invalidateQueries(trpc.settings.get.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to update theme", { description: error.message });
      },
    }),
  );

  const updateLocaleMutation = useMutation(
    trpc.settings.updateLocale.mutationOptions({
      onSuccess: () => {
        toast.success("Language updated");
        void queryClient.invalidateQueries(trpc.settings.get.queryFilter());
      },
      onError: (error) => {
        toast.error("Failed to update language", { description: error.message });
      },
    }),
  );

  const currentTheme = settingsQuery.data?.theme ?? "system";
  const currentLocale = settingsQuery.data?.locale ?? "en";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <Link to="/settings">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Appearance</h1>
          <p className="text-sm text-muted-foreground">
            Customize how DCRM looks and feels.
          </p>
        </div>
      </div>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theme</CardTitle>
          <CardDescription>
            Choose your preferred color scheme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeForm
            currentTheme={currentTheme}
            onSubmit={(theme) => updateThemeMutation.mutate({ theme })}
            isPending={updateThemeMutation.isPending}
          />
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Language</CardTitle>
          </div>
          <CardDescription>
            Select your preferred interface language.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LocaleForm
            currentLocale={currentLocale}
            onSubmit={(locale) => updateLocaleMutation.mutate({ locale })}
            isPending={updateLocaleMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ThemeForm({
  currentTheme,
  onSubmit,
  isPending,
}: {
  readonly currentTheme: string;
  readonly onSubmit: (theme: "light" | "dark" | "system") => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<ThemeFormValues>({
    schema: themeFormSchema,
    fields: themeFormFields,
    formOptions: {
      defaultValues: { theme: currentTheme as "light" | "dark" | "system" },
      onSubmit: async ({ value }) => {
        onSubmit(value.theme);
      },
    },
    disabled: isPending,
  });

  return <Form className="space-y-2" />;
}

function LocaleForm({
  currentLocale,
  onSubmit,
  isPending,
}: {
  readonly currentLocale: string;
  readonly onSubmit: (locale: string) => void;
  readonly isPending: boolean;
}) {
  const { Form } = useFormedible<LocaleFormValues>({
    schema: localeFormSchema,
    fields: localeFormFields,
    formOptions: {
      defaultValues: { locale: currentLocale },
      onSubmit: async ({ value }) => {
        onSubmit(value.locale);
      },
    },
    disabled: isPending,
  });

  return <Form className="space-y-2" />;
}
