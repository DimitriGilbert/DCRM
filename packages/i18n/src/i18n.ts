import type { I18nInstance, Locale, TranslateFn, TranslationDict } from "./types";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./types";

import { en } from "./locales/en";

/** Registered locale → translation dictionary. */
const dictionaries = new Map<Locale, TranslationDict>([
  [DEFAULT_LOCALE, en],
]);

/** Active locale. */
let currentLocale: Locale = DEFAULT_LOCALE;

/**
 * Resolve the effective dictionary for a locale, falling back to default.
 */
function getDict(locale: Locale): TranslationDict {
  return dictionaries.get(locale) ?? dictionaries.get(DEFAULT_LOCALE) ?? en;
}

/**
 * Simple interpolation — replaces `{key}` placeholders with values.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

/** Core translate function. */
const t: TranslateFn = (key, params): string => {
  const dict = getDict(currentLocale);
  const template = dict[key] ?? key;
  return interpolate(template, params);
};

/**
 * Register (or replace) translations for a locale.
 */
function registerTranslations(locale: Locale, dict: TranslationDict): void {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new RangeError(
      `Unsupported locale "${locale}". Supported: ${SUPPORTED_LOCALES.join(", ")}`,
    );
  }
  dictionaries.set(locale, dict);
}

/**
 * Switch the active locale.
 */
function setLocale(locale: Locale): void {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new RangeError(
      `Unsupported locale "${locale}". Supported: ${SUPPORTED_LOCALES.join(", ")}`,
    );
  }
  currentLocale = locale;
}

/**
 * Return the current locale.
 */
function getLocale(): Locale {
  return currentLocale;
}

/**
 * Create a fresh, isolated i18n instance.
 * Useful for server-side per-request contexts.
 */
export function createI18n(locale: Locale = DEFAULT_LOCALE): I18nInstance {
  let instanceLocale: Locale = locale;

  const instanceT: TranslateFn = (key, params): string => {
    const dict = getDict(instanceLocale);
    const template = dict[key] ?? key;
    return interpolate(template, params);
  };

  return {
    get locale() {
      return instanceLocale;
    },
    t: instanceT,
    setLocale: (newLocale: Locale) => {
      if (!SUPPORTED_LOCALES.includes(newLocale)) {
        throw new RangeError(
          `Unsupported locale "${newLocale}". Supported: ${SUPPORTED_LOCALES.join(", ")}`,
        );
      }
      instanceLocale = newLocale;
    },
    registerTranslations,
  };
}

/**
 * Singleton i18n instance for client-side use.
 */
export const i18n: I18nInstance = {
  get locale() {
    return getLocale();
  },
  t,
  setLocale,
  registerTranslations,
};

export { t };
