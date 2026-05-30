import { getLocaleOptions, SUPPORTED_LOCALES } from "@DCRM/i18n";
import type { SupportedLocale } from "@DCRM/i18n";
import { useFormedible } from "@DCRM/ui/components/formedible/hooks/use-formedible";
import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";
import { z } from "zod";

type UserThemePreference = "light" | "dark" | "system";

const userThemePreferences = ["light", "dark", "system"] as const satisfies readonly UserThemePreference[];

export const preferencesFormSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  theme: z.enum(userThemePreferences),
});

export type PreferencesFormValues = Record<string, unknown> & z.infer<typeof preferencesFormSchema>;

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] satisfies readonly { readonly value: UserThemePreference; readonly label: string }[];

export function PreferencesForm({ defaultLocale, defaultTheme, submitting, submitLabel = "Save preferences", onSubmit }: { readonly defaultLocale: SupportedLocale; readonly defaultTheme: UserThemePreference; readonly submitting: boolean; readonly submitLabel?: string; readonly onSubmit: (values: PreferencesFormValues) => Promise<void> }) {
  const fields = [
    {
      name: "locale",
      type: "select",
      label: "Language",
      description: "Stored in your personal DCRM settings.",
      options: getLocaleOptions(),
    },
    {
      name: "theme",
      type: "radio",
      label: "Theme",
      description: "Choose light, dark, or follow your system preference.",
      options: themeOptions,
    },
  ] satisfies readonly FormedibleFieldConfig<PreferencesFormValues>[];

  const { Form } = useFormedible<PreferencesFormValues>({
    schema: preferencesFormSchema,
    fields,
    formOptions: {
      defaultValues: { locale: defaultLocale, theme: defaultTheme },
      onSubmit: async ({ value }) => onSubmit(value),
    },
    submitLabel,
    loading: submitting,
  });

  return <Form className="space-y-4" />;
}
