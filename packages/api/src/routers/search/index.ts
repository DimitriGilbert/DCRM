import { router } from "../../index";
import { globalSearch } from "./global";

export const searchRouter = router({
  global: globalSearch,
});
