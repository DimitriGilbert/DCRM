import { router } from "../../index.js";
import { listFailedHookExecutions } from "./listFailedHookExecutions.js";

export const automationRouter = router({
  listFailedHookExecutions,
});
