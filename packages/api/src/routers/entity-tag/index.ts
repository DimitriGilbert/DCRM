import { router } from "../../index";
import { attachTag } from "./attach";
import { detachTag } from "./detach";

export const entityTagRouter = router({
  attach: attachTag,
  detach: detachTag,
});
