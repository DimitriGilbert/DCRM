import { router } from "../../index";
import { createClient } from "./create";
import { readClient } from "./read";
import { updateClient } from "./update";
import { softDeleteClient } from "./soft-delete";
import { restoreClient } from "./restore";
import { listClients } from "./list";
import { searchClients } from "./search";

export const clientRouter = router({
  create: createClient,
  read: readClient,
  update: updateClient,
  softDelete: softDeleteClient,
  restore: restoreClient,
  list: listClients,
  search: searchClients,
});
