export const DEFAULT_LOCALE = "en" as const;

export const SUPPORTED_LOCALES = [DEFAULT_LOCALE] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

type LocaleOption = {
  readonly value: SupportedLocale;
  readonly label: string;
};

type Messages = typeof en;

type DotPrefix<TPrefix extends string, TKey extends string> = `${TPrefix}.${TKey}`;

type MessageKey<TValue, TPrefix extends string = ""> = TValue extends string
  ? TPrefix
  : {
      readonly [TKey in Extract<keyof TValue, string>]: MessageKey<TValue[TKey], TPrefix extends "" ? TKey : DotPrefix<TPrefix, TKey>>;
    }[Extract<keyof TValue, string>];

export type TranslationKey = MessageKey<Messages>;

export type Translator = (key: TranslationKey) => string;

const en = {
  appShell: {
    productName: "DCRM",
    navigation: {
      home: "Home",
      dashboard: "Dashboard",
      clients: "Clients",
      leads: "Leads",
      projects: "Projects",
      tickets: "Tickets",
      search: "Search",
      data: "Data",
      onboarding: "Onboarding",
    },
  },
  onboarding: {
    language: {
      title: "Choose your language",
      description: "DCRM is starting with English while the translation system is established for future locales.",
      fieldLabel: "Language",
      fieldDescription: "Your language preference is stored in your personal settings.",
      submit: "Save language",
      success: "Language preference saved.",
    },
  },
} as const;

const messagesByLocale = {
  en,
} satisfies Record<SupportedLocale, Messages>;

const localeOptions = {
  en: { value: "en", label: "English" },
} satisfies Record<SupportedLocale, LocaleOption>;

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.some((locale) => locale === value);
}

export function resolveLocale(value: unknown): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function getLocaleOption(locale: SupportedLocale): LocaleOption {
  return localeOptions[locale];
}

export function getLocaleOptions(): readonly LocaleOption[] {
  return SUPPORTED_LOCALES.map((locale) => localeOptions[locale]);
}

export function createTranslator(locale: SupportedLocale): Translator {
  const messages = messagesByLocale[locale];
  return (key) => readMessage(messages, key);
}

function readMessage(messages: Messages, key: TranslationKey): string {
  const segments = key.split(".");
  let current: string | Record<string, unknown> = messages;
  for (const segment of segments) {
    if (typeof current === "string") {
      throw new Error(`Translation key resolves beyond a string: ${key}`);
    }
    const next: unknown = current[segment];
    if (typeof next !== "string" && !isRecord(next)) {
      throw new Error(`Missing translation key: ${key}`);
    }
    current = next;
  }
  if (typeof current !== "string") {
    throw new Error(`Translation key does not resolve to a string: ${key}`);
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
