import { router } from "../../index";

import { listHooks } from "./list";
import { getHook } from "./read";
import { createHook } from "./create";
import { updateHook } from "./update";
import { deleteHook } from "./delete";
import { listExecutions } from "./list-executions";
import { listInsights } from "./list-insights";
import { acceptInsight } from "./accept-insight";

export const hookRouter = router({
  list: listHooks,
  get: getHook,
  create: createHook,
  update: updateHook,
  delete: deleteHook,
  listExecutions: listExecutions,
  listInsights: listInsights,
  acceptInsight: acceptInsight,
});
