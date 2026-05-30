import { router } from "../../index.js";
import { attachTag } from "./attachTag.js";
import { createTag } from "./createTag.js";
import { deleteTag } from "./deleteTag.js";
import { detachTag } from "./detachTag.js";
import { listEntityTags } from "./listEntityTags.js";
import { listTags } from "./listTags.js";
import { restoreTag } from "./restoreTag.js";
import { updateTag } from "./updateTag.js";

export const tagsRouter = router({
  create: createTag,
  list: listTags,
  update: updateTag,
  delete: deleteTag,
  restore: restoreTag,
  attach: attachTag,
  detach: detachTag,
  listEntity: listEntityTags,
});
