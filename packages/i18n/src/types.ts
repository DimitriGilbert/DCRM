/**
 * Supported locale codes.
 * Add new locale keys here as translations are added.
 */
export const SUPPORTED_LOCALES = ["en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Default locale used when no preference is set. */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Flat key-value map of translation strings.
 * Keys use dot-notation for namespacing (e.g. "common.save", "dashboard.title").
 */
export type TranslationDict = Readonly<Record<string, string>>;

/**
 * Translation function — looks up a key in the current locale's dictionary.
 * Falls back to the key itself when no translation is found.
 *
 * @param key   - Dot-notation translation key
 * @param params - Optional interpolation parameters (e.g. { name: "Alice" })
 * @returns Translated string with parameters interpolated
 */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Full i18n instance exposed to consumers.
 */
export interface I18nInstance {
  /** Current active locale */
  readonly locale: Locale;
  /** Translate a key with optional interpolation */
  t: TranslateFn;
  /** Switch to a different supported locale */
  setLocale: (locale: Locale) => void;
  /** Register a locale's translations at runtime */
  registerTranslations: (locale: Locale, dict: TranslationDict) => void;
}
