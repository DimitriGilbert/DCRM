import { router } from "../../index";

import { listIncomingWebhooks } from "./list";
import { getIncomingWebhook } from "./read";
import { createIncomingWebhook } from "./create";
import { updateIncomingWebhook } from "./update";
import { deleteIncomingWebhook } from "./delete";
import { testMapping } from "./test-mapping";

export const incomingWebhookRouter = router({
  list: listIncomingWebhooks,
  get: getIncomingWebhook,
  create: createIncomingWebhook,
  update: updateIncomingWebhook,
  delete: deleteIncomingWebhook,
  testMapping: testMapping,
});
