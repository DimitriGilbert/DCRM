import { router } from "../../index.js";
import { globalSearch } from "./globalSearch.js";

export const searchRouter = router({
  global: globalSearch,
});
