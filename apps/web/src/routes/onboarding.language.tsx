import { createTranslator, resolveLocale } from "@DCRM/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@DCRM/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageFrame, PageHeader } from "@/features/client-lead/views";
import { LanguageForm } from "@/features/onboarding/language-form";
import type { LanguageFormValues } from "@/features/onboarding/language-form";
import { getUser } from "@/functions/get-user";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/onboarding/language")({
  component: RouteComponent,
  beforeLoad: async () => ({ session: await getUser() }),
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
    throw redirect({ to: "/onboarding" });
  },
});

function RouteComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const updateLocale = useMutation(trpc.settings.updateLocale.mutationOptions());
  const locale = resolveLocale(settings.data?.locale);
  const t = createTranslator(locale);

  async function handleSubmit(values: LanguageFormValues) {
    await updateLocale.mutateAsync({ locale: values.locale });
    await queryClient.invalidateQueries();
    toast.success(t("onboarding.language.success"));
  }

  return (
    <PageFrame>
      <PageHeader eyebrow={t("appShell.navigation.onboarding")} title={t("onboarding.language.title")} description={t("onboarding.language.description")} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t("onboarding.language.title")}</CardTitle>
          <CardDescription>{t("onboarding.language.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageForm defaultLocale={locale} submitting={updateLocale.isPending || settings.isLoading} t={t} onSubmit={handleSubmit} />
        </CardContent>
      </Card>
    </PageFrame>
  );
}
