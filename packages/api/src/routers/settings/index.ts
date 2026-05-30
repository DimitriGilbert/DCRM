import { router } from "../../index";

import { getSettings } from "./get-settings";
import { updateLocale } from "./update-locale";

export const settingsRouter = router({
  get: getSettings,
  updateLocale,
});
