import { router } from "../../index";
import { createTag } from "./create";
import { listTags } from "./list";
import { updateTag } from "./update";
import { deleteTag } from "./delete";

export const tagRouter = router({
  create: createTag,
  list: listTags,
  update: updateTag,
  delete: deleteTag,
});
