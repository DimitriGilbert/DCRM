import { getLocaleOptions, SUPPORTED_LOCALES } from "@DCRM/i18n";
import type { SupportedLocale, Translator } from "@DCRM/i18n";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

export const languageFormSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

export type LanguageFormValues = Record<string, unknown> & z.infer<typeof languageFormSchema>;

export function LanguageForm({ defaultLocale, submitting, t, onSubmit }: { readonly defaultLocale: SupportedLocale; readonly submitting: boolean; readonly t: Translator; readonly onSubmit: (values: LanguageFormValues) => Promise<void> }) {
  const fields = [
    {
      name: "locale",
      type: "select",
      label: t("onboarding.language.fieldLabel"),
      description: t("onboarding.language.fieldDescription"),
      options: getLocaleOptions(),
    },
  ] satisfies readonly FormedibleFieldConfig<LanguageFormValues>[];

  const { Form } = useFormedible<LanguageFormValues>({
    schema: languageFormSchema,
    fields,
    formOptions: {
      defaultValues: { locale: defaultLocale },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel: t("onboarding.language.submit"),
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}
