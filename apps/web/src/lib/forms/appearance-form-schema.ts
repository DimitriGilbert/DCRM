import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const themeFormSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
});

type ThemeFormValues = z.infer<typeof themeFormSchema>;

const themeFormFields: readonly FormedibleFieldConfig<ThemeFormValues>[] = [
  {
    name: "theme",
    type: "radio",
    label: "Theme",
    options: [
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
      { label: "System", value: "system" },
    ],
  },
];

const localeFormSchema = z.object({
  locale: z.string().min(1).max(10),
});

type LocaleFormValues = z.infer<typeof localeFormSchema>;

const localeFormFields: readonly FormedibleFieldConfig<LocaleFormValues>[] = [
  {
    name: "locale",
    type: "radio",
    label: "Language",
    options: [
      { label: "English", value: "en" },
    ],
  },
];

export {
  themeFormSchema,
  themeFormFields,
  localeFormSchema,
  localeFormFields,
};
export type { ThemeFormValues, LocaleFormValues };
