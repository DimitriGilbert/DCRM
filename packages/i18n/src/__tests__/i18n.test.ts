import { describe, expect, it } from "vitest";

import {
  createI18n,
  DEFAULT_LOCALE,
  i18n,
  SUPPORTED_LOCALES,
  t,
} from "../index";

import { en } from "../locales/en";
import type { Locale, TranslationDict } from "../types";

describe("i18n types", () => {
  it("has en as the only supported locale initially", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en"]);
  });

  it("has en as default locale", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
});

describe("singleton i18n", () => {
  it("translates known keys from English defaults", () => {
    expect(i18n.t("common.save")).toBe("Save");
    expect(i18n.t("common.cancel")).toBe("Cancel");
    expect(i18n.t("nav.dashboard")).toBe("Dashboard");
    expect(i18n.t("app.name")).toBe("DCRM");
  });

  it("returns the key when no translation exists", () => {
    expect(i18n.t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("interpolates parameters", () => {
    expect(i18n.t("onboarding.step", { current: 1, total: 3 })).toBe(
      "Step 1 of 3",
    );
  });

  it("defaults to en locale", () => {
    expect(i18n.locale).toBe("en");
  });

  it("rejects unsupported locales on setLocale", () => {
    expect(() => i18n.setLocale("zz" as Locale)).toThrow(RangeError);
  });

  it("rejects unsupported locales on registerTranslations", () => {
    expect(() =>
      i18n.registerTranslations("zz" as Locale, {}),
    ).toThrow(RangeError);
  });
});

describe("createI18n", () => {
  it("creates an isolated instance with default locale", () => {
    const instance = createI18n();
    expect(instance.locale).toBe("en");
    expect(instance.t("common.save")).toBe("Save");
  });

  it("creates an instance with a specific locale", () => {
    const instance = createI18n("en");
    expect(instance.locale).toBe("en");
  });

  it("isolated instance does not affect singleton", () => {
    const before = i18n.locale;
    const instance = createI18n();
    // instance is en, singleton stays en — no side-effects
    expect(i18n.locale).toBe(before);
    void instance;
  });

  it("isolated instance can set locale independently", () => {
    const instance = createI18n();
    // Only en is supported so just confirm it stays on en
    instance.setLocale("en");
    expect(instance.locale).toBe("en");
  });
});

describe("t (curried export)", () => {
  it("translates via singleton", () => {
    expect(t("common.loading")).toBe("Loading…");
  });

  it("interpolates via singleton", () => {
    expect(t("onboarding.step", { current: 2, total: 5 })).toBe(
      "Step 2 of 5",
    );
  });
});

describe("registerTranslations", () => {
  it("registers and uses a custom locale's translations", () => {
    // Register a pseudo-locale by first adding it to supported list isn't
    // possible at runtime (const), so we test with the default locale override.
    const custom: TranslationDict = {
      "common.save": "CustomSave",
      "common.cancel": "CustomCancel",
    };
    i18n.registerTranslations("en", custom);
    expect(i18n.t("common.save")).toBe("CustomSave");
    expect(i18n.t("common.cancel")).toBe("CustomCancel");
    // Key not in custom falls back to key itself
    expect(i18n.t("common.edit")).toBe("common.edit");
    // Restore original dictionary
    i18n.registerTranslations("en", en);
  });
});
