import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, createTranslator, getLocaleOption, isSupportedLocale } from "./index.js";

describe("DCRM i18n foundation", () => {
  it("uses English as the default supported locale", () => {
    assert.equal(DEFAULT_LOCALE, "en");
    assert.deepEqual(SUPPORTED_LOCALES, ["en"]);
    assert.equal(isSupportedLocale("en"), true);
    assert.equal(isSupportedLocale("fr"), false);
  });

  it("translates nested English message keys through the public translator", () => {
    const t = createTranslator("en");

    assert.equal(t("appShell.navigation.dashboard"), "Dashboard");
    assert.equal(t("onboarding.language.title"), "Choose your language");
    assert.equal(t("onboarding.language.submit"), "Save language");
  });

  it("exposes locale labels for language selection", () => {
    assert.deepEqual(getLocaleOption("en"), { value: "en", label: "English" });
  });
});
