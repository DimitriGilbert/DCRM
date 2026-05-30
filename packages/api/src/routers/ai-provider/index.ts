import { router } from "../../index";

import { listAIProviders } from "./list";
import { getAIProvider } from "./read";
import { createAIProvider } from "./create";
import { updateAIProvider } from "./update";
import { deleteAIProvider } from "./delete";

export const aiProviderRouter = router({
  list: listAIProviders,
  get: getAIProvider,
  create: createAIProvider,
  update: updateAIProvider,
  delete: deleteAIProvider,
});
