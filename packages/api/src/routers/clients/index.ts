import { router } from "../../index.js";
import { createClient } from "./createClient.js";
import { deleteClient } from "./deleteClient.js";
import { getClient } from "./getClient.js";
import { listClients } from "./listClients.js";
import { restoreClient } from "./restoreClient.js";
import { updateClient } from "./updateClient.js";

export const clientsRouter = router({
  create: createClient,
  get: getClient,
  list: listClients,
  update: updateClient,
  delete: deleteClient,
  restore: restoreClient,
});
