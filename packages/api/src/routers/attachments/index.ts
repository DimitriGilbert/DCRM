import { router } from "../../index.js";
import { createAttachment } from "./createAttachment.js";
import { listForTarget } from "./listForTarget.js";

export const attachmentsRouter = router({
  create: createAttachment,
  listForTarget,
});
