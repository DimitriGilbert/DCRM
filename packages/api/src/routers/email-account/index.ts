import { router } from "../../index";

import { listEmailAccounts } from "./list";
import { readEmailAccount } from "./read";
import { createEmailAccount } from "./create";
import { updateEmailAccount } from "./update";
import { deleteEmailAccount } from "./delete";
import { addAuthorizedAddress } from "./add-authorized-address";
import { removeAuthorizedAddress } from "./remove-authorized-address";
import { listAuthorizedAddresses } from "./list-authorized-addresses";

export const emailAccountRouter = router({
  list: listEmailAccounts,
  get: readEmailAccount,
  create: createEmailAccount,
  update: updateEmailAccount,
  delete: deleteEmailAccount,
  addAuthorizedAddress: addAuthorizedAddress,
  removeAuthorizedAddress: removeAuthorizedAddress,
  listAuthorizedAddresses: listAuthorizedAddresses,
});
