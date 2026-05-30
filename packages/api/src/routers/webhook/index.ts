import { router } from "../../index";

import { listOutgoingWebhooks } from "./list";
import { getOutgoingWebhook } from "./read";
import { createOutgoingWebhook } from "./create";
import { updateOutgoingWebhook } from "./update";
import { deleteOutgoingWebhook } from "./delete";

export const webhookRouter = router({
  list: listOutgoingWebhooks,
  get: getOutgoingWebhook,
  create: createOutgoingWebhook,
  update: updateOutgoingWebhook,
  delete: deleteOutgoingWebhook,
});
