import { router } from "../../index";

import { completeOnboarding } from "./complete-onboarding";
import { getSettings } from "./get-settings";
import { updateLocale } from "./update-locale";
import { updateTheme } from "./update-theme";

export const settingsRouter = router({
  get: getSettings,
  updateLocale,
  updateTheme,
  completeOnboarding,
});
